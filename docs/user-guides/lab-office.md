# The lab office: a guide for the lab's owner

The lab office is the owner's page: every school and every person, and the few
things only the owner may do. Only accounts made owners on the server see it,
under **Lab office** in the header.

## Becoming an owner

1. Open an account on the lab like anyone else: **New account → 18 or older**,
   with your email and a password, and open the link sent to your email.
2. On the server, where the database is, run:

   ```bash
   pnpm --filter @banglalab/api owner:grant you@example.com
   ```

   It works only for an open adult account. To take it back, add `--revoke`.
   Both are written to the audit log. There is no way to become an owner from
   the web.

## What you can do

| Where    | What                                                                                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top line | Working schools, schools waiting for you, teachers, people on their own (adults, and learners under 18), class learners, suspended accounts and schools, and new accounts this week                 |
| Schools  | Search and filter. **Suspend** a school: no one can join its classes, and its teachers cannot make classes or invitations, until you **start** it again. **Close** a school; it can be **reopened** |
| People   | Search by name, email or sign-in name, and filter by kind. **Suspend** an account (signed out on every device at once) and **restore** it; **close** it for good                                    |
| People   | **Reset link**: a one-time link to set a new password, working for 24 hours, for you to hand on yourself (to the adult, or to a learner's guardian). For when email does not arrive                 |
| Activity | The latest 100 actions: who did what, and when                                                                                                                                                      |

Every change asks first, in words that say what will happen, and is written to
the log with you as the one who did it.

## What you see, and do not

You see what running the lab needs: names and emails of adults, whether an
email is confirmed, and the schools and classes people belong to. For learners
you see the nickname, their own sign-in name if they have one, the number of
classes they are in, and whether a guardian approved, with the guardian's
email shown only in part. You never see a learner's progress or projects here.

## Safety rules the lab keeps

- Your own account, and every other owner's, cannot be suspended or closed
  from the office, so the lab never loses its last owner by mistake.
- A class learner has no password: for a lost key, their teacher gives a new
  one, so the office offers no reset link for them.
- Closing an account cannot be undone from the office.
