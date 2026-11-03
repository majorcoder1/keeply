<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

// Everything that touches a person's notes is closed until they have turned on
// two-factor sign-in. Accounts made before it existed are asked to set it up the next
// time they open the app.
class EnsureTwoFactor
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && ! $user->two_factor_confirmed_at) {
            return response()->json([
                'message' => 'Turn on two-factor sign-in first.',
                'two_factor_required' => true,
            ], 403);
        }

        return $next($request);
    }
}
