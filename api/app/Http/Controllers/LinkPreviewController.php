<?php

namespace App\Http\Controllers;

use DOMDocument;
use DOMXPath;
use Illuminate\Http\Request;
use RuntimeException;

// "Rich link previews": given a web address from a note, fetch the page's title, description
// and picture so the app can show a card. The browser can't do this itself (other sites block
// it), so the server does it for a person who has turned the setting on.
//
// Privacy: the server learns the web ADDRESS being previewed (never the note). The address is
// sent in the request body, not the URL, so it stays out of access logs, and nothing is stored.
//
// Safety: a server that fetches whatever address it is given can be tricked into reaching its own
// network ("SSRF"). So: only http/https on ports 80/443, no passwords in the address, every
// address (and every redirect) must resolve to a PUBLIC internet address, the connection is pinned
// to the address that was checked, and replies are capped in size and time.
class LinkPreviewController extends Controller
{
    private const MAX_HTML = 524288;   // 512 KB is plenty to find the title and meta tags
    private const MAX_IMAGE = 262144;  // 256 KB
    private const TIMEOUT = 6;
    private const MAX_REDIRECTS = 3;

    public function show(Request $request)
    {
        $url = $request->validate(['url' => ['required', 'string', 'max:2000']])['url'];

        try {
            $page = $this->fetch($url, self::MAX_HTML, ['text/html', 'application/xhtml+xml'], true);
        } catch (RuntimeException $e) {
            return response()->json(['message' => 'No preview is available for that link.'], 422);
        }

        $meta = $this->parse($page['body'], $page['url'], $page['charset']);

        if ($meta['image']) {
            try {
                $image = $this->fetch($meta['image'], self::MAX_IMAGE, ['image/jpeg', 'image/png', 'image/gif', 'image/webp'], false);
                $meta['image'] = 'data:'.$image['type'].';base64,'.base64_encode($image['body']);
            } catch (RuntimeException $e) {
                $meta['image'] = null;
            }
        }

        if ($meta['title'] === '' && $meta['description'] === '' && ! $meta['image']) {
            return response()->json(['message' => 'No preview is available for that link.'], 422);
        }

        return response()->json($meta)->header('Cache-Control', 'private, max-age=86400');
    }

    // ---- fetching (with every safety check) ----------------------------------------------------

    private function fetch(string $url, int $maxBytes, array $types, bool $truncate): array
    {
        for ($hop = 0; $hop <= self::MAX_REDIRECTS; $hop++) {
            [$host, $port, $ip] = $this->checkAddress($url);

            $body = '';
            $headers = [];
            $blocked = false;
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_TIMEOUT => self::TIMEOUT,
                CURLOPT_CONNECTTIMEOUT => 4,
                CURLOPT_RESOLVE => ["$host:$port:$ip"], // connect to exactly the address that was checked
                CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
                CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; KeeplyLinkPreview/1.0)',
                CURLOPT_HTTPHEADER => ['Accept: text/html,application/xhtml+xml,image/*;q=0.8'],
                CURLOPT_ENCODING => '',
                CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$headers) {
                    $parts = explode(':', $line, 2);
                    if (count($parts) === 2) {
                        $headers[strtolower(trim($parts[0]))] = trim($parts[1]);
                    }

                    return strlen($line);
                },
                CURLOPT_WRITEFUNCTION => function ($ch, $chunk) use (&$body, &$headers, &$blocked, $maxBytes, $types, $truncate) {
                    // Only read bodies of the kind we asked for (and not on redirects/errors).
                    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
                    if ($status === 200 && ! $this->typeAllowed($headers['content-type'] ?? '', $types)) {
                        $blocked = true;

                        return 0;
                    }
                    $body .= $chunk;
                    if (strlen($body) > $maxBytes) {
                        if ($truncate) {
                            $body = substr($body, 0, $maxBytes);
                        } else {
                            $blocked = true;
                        }

                        return 0; // stop downloading
                    }

                    return strlen($chunk);
                },
            ]);
            curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            curl_close($ch);

            if ($status >= 300 && $status < 400 && ! empty($headers['location'])) {
                $url = $this->absolute($url, $headers['location']);

                continue; // checked again at the top of the loop
            }
            if ($blocked && ! ($truncate && $body !== '')) {
                throw new RuntimeException('not allowed');
            }
            if ($status !== 200 || $body === '') {
                throw new RuntimeException('no content');
            }

            $type = strtolower(trim(explode(';', $headers['content-type'] ?? '')[0]));
            preg_match('/charset=([\w-]+)/i', $headers['content-type'] ?? '', $m);

            return ['body' => $body, 'type' => $type, 'charset' => $m[1] ?? '', 'url' => $url];
        }

        throw new RuntimeException('too many redirects');
    }

    private function typeAllowed(string $contentType, array $types): bool
    {
        return in_array(strtolower(trim(explode(';', $contentType)[0])), $types, true);
    }

    // Returns [host, port, ip] only for a plain public web address; throws for anything else.
    private function checkAddress(string $url): array
    {
        $p = parse_url($url);
        if (! $p || empty($p['scheme']) || empty($p['host'])) {
            throw new RuntimeException('bad address');
        }
        $scheme = strtolower($p['scheme']);
        if (! in_array($scheme, ['http', 'https'], true) || isset($p['user']) || isset($p['pass'])) {
            throw new RuntimeException('bad address');
        }
        $port = (int) ($p['port'] ?? ($scheme === 'https' ? 443 : 80));
        if (! config('services.link_preview.allow_private') && ! in_array($port, [80, 443], true)) {
            throw new RuntimeException('bad port');
        }

        $host = strtolower(rtrim($p['host'], '.'));
        $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : (gethostbynamel($host) ?: []);
        if (! $ips) {
            throw new RuntimeException('no address');
        }
        foreach ($ips as $ip) {
            if (! $this->isPublic($ip)) {
                throw new RuntimeException('not a public address');
            }
        }

        return [$host, $port, $ips[0]];
    }

    private function isPublic(string $ip): bool
    {
        if (config('services.link_preview.allow_private')) {
            return (bool) filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4); // tests only
        }
        if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return false;
        }
        $n = ip2long($ip);

        return ! ($n >= ip2long('100.64.0.0') && $n <= ip2long('100.127.255.255')); // carrier-grade NAT
    }

    private function absolute(string $base, string $ref): string
    {
        if (preg_match('#^[a-z][a-z0-9+.-]*://#i', $ref)) {
            return $ref;
        }
        $b = parse_url($base);
        $root = $b['scheme'].'://'.$b['host'].(isset($b['port']) ? ':'.$b['port'] : '');
        if (str_starts_with($ref, '//')) {
            return $b['scheme'].':'.$ref;
        }
        if (str_starts_with($ref, '/')) {
            return $root.$ref;
        }
        $dir = rtrim(dirname($b['path'] ?? '/'), '/');

        return $root.$dir.'/'.$ref;
    }

    // ---- reading the page -----------------------------------------------------------------------

    private function parse(string $html, string $pageUrl, string $charset): array
    {
        $html = $this->toUtf8($html, $charset);
        $doc = new DOMDocument;
        libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="utf-8" ?>'.$html, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
        libxml_clear_errors();
        $xp = new DOMXPath($doc);

        $meta = function (array $names) use ($xp): string {
            foreach ($names as $name) {
                $n = $xp->query('//meta[@property="'.$name.'" or @name="'.$name.'"]/@content')->item(0);
                if ($n && trim($n->nodeValue) !== '') {
                    return trim($n->nodeValue);
                }
            }

            return '';
        };

        $title = $meta(['og:title', 'twitter:title']);
        if ($title === '') {
            $t = $xp->query('//title')->item(0);
            $title = $t ? $t->textContent : '';
        }
        $image = $meta(['og:image', 'og:image:url', 'twitter:image']);

        return [
            'title' => $this->clean($title, 150),
            'description' => $this->clean($meta(['og:description', 'description', 'twitter:description']), 220),
            'site' => $this->clean($meta(['og:site_name']) ?: (parse_url($pageUrl, PHP_URL_HOST) ?: ''), 60),
            'image' => $image !== '' ? $this->absolute($pageUrl, html_entity_decode($image)) : null,
            'url' => $pageUrl,
        ];
    }

    private function clean(string $text, int $max): string
    {
        $text = html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8');

        return mb_substr(trim(preg_replace('/\s+/u', ' ', $text) ?? ''), 0, $max);
    }

    private function toUtf8(string $html, string $charset): string
    {
        if ($charset === '' && preg_match('/<meta[^>]+charset=["\']?([\w-]+)/i', substr($html, 0, 4096), $m)) {
            $charset = $m[1];
        }
        $charset = strtoupper($charset ?: 'UTF-8');
        if ($charset !== 'UTF-8' && in_array($charset, array_map('strtoupper', mb_list_encodings()), true)) {
            return mb_convert_encoding($html, 'UTF-8', $charset);
        }

        return mb_check_encoding($html, 'UTF-8') ? $html : mb_convert_encoding($html, 'UTF-8', 'ISO-8859-1');
    }
}
