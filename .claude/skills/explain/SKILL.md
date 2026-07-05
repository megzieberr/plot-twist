---
name: explain
description: Give a plain-English, beginner-friendly explanation of any file, folder, function, error message, or concept in this project. Use whenever the user asks "what is", "what does X do", "explain", "I don't understand", or pastes an error she finds confusing.
---

# Explain — plain-English tour guide

The user is not a developer. This skill turns any piece of this project into
an explanation a smart person with zero programming background can follow.

## Input

`$ARGUMENTS` may be a file path, a folder, a function name, an error message,
a technical term, or a vague question like "the scoring thing". If it's empty,
ask what she'd like explained and offer 3 good starting points (e.g. "how a
recommendation is picked", "what Supabase does for us", "what happens when
you tap a rating").

## How to answer

1. **Read the relevant code/files first.** Never explain from memory alone.
2. Open with **one sentence saying what the thing IS in everyday terms**,
   using an analogy where it helps. Example: "`scorer.js` is the judge of the
   app — every candidate show walks in, gets scored against your taste, and
   the highest scores make it into your Discover deck."
3. Then a short **"what happens, step by step"** story (numbered, max ~6
   steps), following the data the way she'd experience it in the app
   ("when you swipe right, …").
4. Define every technical word inline in parentheses the first time it
   appears. No jargon left unexplained. Never say "just", "simply", or
   "obviously".
5. Only show code if it genuinely helps — max a few lines, and walk through
   it line by line in words.
6. Close with **"why it's built this way"** in 1–2 sentences, and offer one
   natural follow-up ("want me to show what happens to that score next?").

## For error messages specifically

1. First sentence: what it means for HER and the app ("your data is safe,
   the app just couldn't reach the movie database").
2. Then the likely cause in plain terms.
3. Then the fix — exact steps, exact places to click, no assumed knowledge.

## Tone

Warm, unhurried, zero condescension. She's smart — she's a beginner, not a
child. Aim for "friendly science-museum guide", not "textbook" and not
"baby talk".
