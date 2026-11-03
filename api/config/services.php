<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // Link previews fetch pages for people who turn them on. Private/internal addresses are always
    // refused; this switch exists only so the automated tests can use a local test website.
    'link_preview' => [
        'allow_private' => (bool) env('LINK_PREVIEW_ALLOW_PRIVATE', false),
    ],

    // Where the single-page app is served — used to build the password-reset link
    // that goes in the reset email. Defaults to the production domain.
    'frontend' => [
        'url' => env('FRONTEND_URL', 'https://keeply.4thepeople.live'),
    ],

];
