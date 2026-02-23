begin;

update public.exercise_library
set animation_spec_id = 'finishing_first_touch_1'
where id = '80dbfd79-87a5-45f0-be7b-1e8c9378dda9'
  and is_system = true;

update public.exercise_library
set animation_spec_id = 'sync_runs_with_teammate_2'
where id = 'bb14ef37-0438-4496-b21d-b7ac5a3bb4b9'
  and is_system = true;

update public.exercise_library
set animation_spec_id = 'attack_far_post_3'
where id = '2a80fd3d-3b90-4b80-9d4c-465299000136'
  and is_system = true;

update public.exercise_library
set animation_spec_id = 'move_relative_to_ballholder_4'
where id = '34a6160d-3efd-46d7-8cf4-df85d04af7de'
  and is_system = true;

update public.exercise_library
set animation_spec_id = 'false9_drop_into_space_5'
where id = '73ecb6a4-da4e-4270-96d5-d44f6615a0eb'
  and is_system = true;

update public.exercise_library
set animation_spec_id = 'hold_up_play_under_pressure_6'
where id = 'daecaca5-25b1-468c-a05a-03294513af54'
  and is_system = true;

update public.exercise_library
set animation_spec_id = 'pin_center_back_7'
where id = 'a099d83c-d2df-4761-98ae-7a23faa389e7'
  and is_system = true;

update public.exercise_library
set animation_spec_id = 'communicate_runs_8'
where id = '5e5bbf1b-bd64-4978-b486-fd1354023c67'
  and is_system = true;

update public.exercise_library
set animation_spec_id = 'near_post_run_cross_9'
where id = 'b104bb6f-59f7-414d-81a5-fee473b95c8b'
  and is_system = true;

update public.exercise_library
set animation_spec_id = 'press_first_pass_10'
where id = '54dbe50c-255d-4449-9fb5-c1b8aa7bc3bc'
  and is_system = true;

commit;
