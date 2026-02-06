
-- Correct single-encoded mojibake from earlier migration (pÃ¥ / trÃ¦) that was not fixed
-- by 20260206120317_fix_feedback_text.sql (which targeted double-encoded strings).
-- Safe to rerun: UPDATE statements are idempotent.

-- Fix titles like "Feedback pÃ¥ ..."
update public.activity_tasks
   set title = replace(title, 'Feedback pÃ¥ ', 'Feedback på ')
 where title like 'Feedback pÃ¥ %';

-- Fix descriptions containing "trÃ¦ningen" -> "træningen"
update public.activity_tasks
   set description = replace(description, 'trÃ¦ningen', 'træningen')
 where description like '%trÃ¦ningen%';

-- Fix descriptions containing "trÃ¦neren" -> "træneren"
update public.activity_tasks
   set description = replace(description, 'trÃ¦neren', 'træneren')
 where description like '%trÃ¦neren%';
