<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;

class FeedbackController extends Controller
{
    // Send in-app feedback to the 4thepeople team by email (no mail app opens for the user).
    public function send(Request $request)
    {
        $data = $request->validate([
            'message' => ['required', 'string', 'max:5000'],
        ]);

        $user = $request->user();
        $to = 'feedback@4thepeople.live';

        $body = "New Keeply feedback\n\n"
            . "From: {$user->name} <{$user->email}>\n"
            . "--------------------------------------\n\n"
            . $data['message'];

        Mail::raw($body, function ($m) use ($to, $user) {
            $m->to($to)
                ->subject('[Keeply] Feedback from ' . $user->name)
                ->replyTo($user->email, $user->name);
        });

        return response()->json(['message' => 'Thanks for the feedback!']);
    }
}
