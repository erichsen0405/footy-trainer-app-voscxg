export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          activity_date: string
          activity_end_time: string | null
          activity_time: string
          category_id: string | null
          category_updated_at: string | null
          created_at: string
          external_calendar_id: string | null
          external_category: string | null
          external_event_id: string | null
          id: string
          is_external: boolean
          location: string | null
          manually_set_category: boolean | null
          player_id: string | null
          series_id: string | null
          series_instance_date: string | null
          team_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_date: string
          activity_end_time?: string | null
          activity_time: string
          category_id?: string | null
          category_updated_at?: string | null
          created_at?: string
          external_calendar_id?: string | null
          external_category?: string | null
          external_event_id?: string | null
          id?: string
          is_external?: boolean
          location?: string | null
          manually_set_category?: boolean | null
          player_id?: string | null
          series_id?: string | null
          series_instance_date?: string | null
          team_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_date?: string
          activity_end_time?: string | null
          activity_time?: string
          category_id?: string | null
          category_updated_at?: string | null
          created_at?: string
          external_calendar_id?: string | null
          external_category?: string | null
          external_event_id?: string | null
          id?: string
          is_external?: boolean
          location?: string | null
          manually_set_category?: boolean | null
          player_id?: string | null
          series_id?: string | null
          series_instance_date?: string | null
          team_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "activity_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "activity_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_categories: {
        Row: {
          color: string
          created_at: string
          emoji: string
          id: string
          is_system: boolean | null
          name: string
          player_id: string | null
          team_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          color: string
          created_at?: string
          emoji: string
          id?: string
          is_system?: boolean | null
          name: string
          player_id?: string | null
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          emoji?: string
          id?: string
          is_system?: boolean | null
          name?: string
          player_id?: string | null
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_categories_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_series: {
        Row: {
          activity_time: string
          category_id: string | null
          created_at: string
          end_date: string | null
          id: string
          location: string | null
          player_id: string | null
          recurrence_days: number[] | null
          recurrence_type: string
          start_date: string
          team_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_time: string
          category_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          location?: string | null
          player_id?: string | null
          recurrence_days?: number[] | null
          recurrence_type: string
          start_date: string
          team_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_time?: string
          category_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          location?: string | null
          player_id?: string | null
          recurrence_days?: number[] | null
          recurrence_type?: string
          start_date?: string
          team_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_series_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "activity_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_series_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_task_subtasks: {
        Row: {
          activity_task_id: string
          completed: boolean
          created_at: string
          id: string
          sort_order: number
          title: string
        }
        Insert: {
          activity_task_id: string
          completed?: boolean
          created_at?: string
          id?: string
          sort_order?: number
          title: string
        }
        Update: {
          activity_task_id?: string
          completed?: boolean
          created_at?: string
          id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_task_subtasks_activity_task_id_fkey"
            columns: ["activity_task_id"]
            isOneToOne: false
            referencedRelation: "activity_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_tasks: {
        Row: {
          activity_id: string
          completed: boolean
          created_at: string
          description: string | null
          id: string
          reminder_minutes: number | null
          task_template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          completed?: boolean
          created_at?: string
          description?: string | null
          id?: string
          reminder_minutes?: number | null
          task_template_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          completed?: boolean
          created_at?: string
          description?: string | null
          id?: string
          reminder_minutes?: number | null
          task_template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_tasks_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_tasks_task_template_id_fkey"
            columns: ["task_template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_player_relationships: {
        Row: {
          admin_id: string
          created_at: string | null
          id: string
          player_id: string
        }
        Insert: {
          admin_id: string
          created_at?: string | null
          id?: string
          player_id: string
        }
        Update: {
          admin_id?: string
          created_at?: string | null
          id?: string
          player_id?: string
        }
        Relationships: []
      }
      category_mappings: {
        Row: {
          created_at: string | null
          external_category: string
          id: string
          internal_category_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          external_category: string
          id?: string
          internal_category_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          external_category?: string
          id?: string
          internal_category_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_mappings_internal_category_id_fkey"
            columns: ["internal_category_id"]
            isOneToOne: false
            referencedRelation: "activity_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sync_log: {
        Row: {
          action: string
          calendar_id: string | null
          details: Json | null
          external_event_id: string | null
          id: string
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          calendar_id?: string | null
          details?: Json | null
          external_event_id?: string | null
          id?: string
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          calendar_id?: string | null
          details?: Json | null
          external_event_id?: string | null
          id?: string
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_sync_log_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "external_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sync_log_external_event_id_fkey"
            columns: ["external_event_id"]
            isOneToOne: false
            referencedRelation: "events_external"
            referencedColumns: ["id"]
          },
        ]
      }
      events_external: {
        Row: {
          created_at: string | null
          deleted: boolean | null
          description: string | null
          end_date: string | null
          end_time: string | null
          external_last_modified: string | null
          fetched_at: string | null
          id: string
          is_all_day: boolean | null
          location: string | null
          miss_count: number | null
          provider: string
          provider_calendar_id: string | null
          provider_event_uid: string
          raw_payload: Json | null
          recurrence_id: string | null
          start_date: string
          start_time: string
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted?: boolean | null
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          external_last_modified?: string | null
          fetched_at?: string | null
          id?: string
          is_all_day?: boolean | null
          location?: string | null
          miss_count?: number | null
          provider: string
          provider_calendar_id?: string | null
          provider_event_uid: string
          raw_payload?: Json | null
          recurrence_id?: string | null
          start_date: string
          start_time: string
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted?: boolean | null
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          external_last_modified?: string | null
          fetched_at?: string | null
          id?: string
          is_all_day?: boolean | null
          location?: string | null
          miss_count?: number | null
          provider?: string
          provider_calendar_id?: string | null
          provider_event_uid?: string
          raw_payload?: Json | null
          recurrence_id?: string | null
          start_date?: string
          start_time?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_external_provider_calendar_id_fkey"
            columns: ["provider_calendar_id"]
            isOneToOne: false
            referencedRelation: "external_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      events_local_meta: {
        Row: {
          category_id: string | null
          category_updated_at: string | null
          created_at: string | null
          custom_fields: Json | null
          external_event_id: string | null
          id: string
          last_local_modified: string | null
          local_description: string | null
          local_end_override: string | null
          local_start_override: string | null
          local_title_override: string | null
          manually_set_category: boolean | null
          pinned: boolean | null
          player_id: string | null
          reminders: Json | null
          team_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category_id?: string | null
          category_updated_at?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          external_event_id?: string | null
          id?: string
          last_local_modified?: string | null
          local_description?: string | null
          local_end_override?: string | null
          local_start_override?: string | null
          local_title_override?: string | null
          manually_set_category?: boolean | null
          pinned?: boolean | null
          player_id?: string | null
          reminders?: Json | null
          team_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category_id?: string | null
          category_updated_at?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          external_event_id?: string | null
          id?: string
          last_local_modified?: string | null
          local_description?: string | null
          local_end_override?: string | null
          local_start_override?: string | null
          local_title_override?: string | null
          manually_set_category?: boolean | null
          pinned?: boolean | null
          player_id?: string | null
          reminders?: Json | null
          team_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_local_meta_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "activity_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_local_meta_external_event_id_fkey"
            columns: ["external_event_id"]
            isOneToOne: false
            referencedRelation: "events_external"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_local_meta_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_assignments: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          player_id: string | null
          team_id: string | null
          trainer_id: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          player_id?: string | null
          team_id?: string | null
          trainer_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          player_id?: string | null
          team_id?: string | null
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_assignments_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_library: {
        Row: {
          category_path: string | null
          created_at: string
          description: string | null
          id: string
          is_system: boolean | null
          title: string
          trainer_id: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          category_path?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean | null
          title: string
          trainer_id: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          category_path?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean | null
          title?: string
          trainer_id?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      exercise_subtasks: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_subtasks_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_library"
            referencedColumns: ["id"]
          },
        ]
      }
      external_calendars: {
        Row: {
          auto_sync_enabled: boolean | null
          created_at: string
          enabled: boolean
          event_count: number | null
          ics_url: string
          id: string
          last_fetched: string | null
          name: string
          sync_interval_minutes: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_sync_enabled?: boolean | null
          created_at?: string
          enabled?: boolean
          event_count?: number | null
          ics_url: string
          id?: string
          last_fetched?: string | null
          name: string
          sync_interval_minutes?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_sync_enabled?: boolean | null
          created_at?: string
          enabled?: boolean
          event_count?: number | null
          ics_url?: string
          id?: string
          last_fetched?: string | null
          name?: string
          sync_interval_minutes?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      external_event_mappings: {
        Row: {
          external_event_id: number
          id: number
          mapped_at: string | null
          provider: string
          provider_uid: string
        }
        Insert: {
          external_event_id: number
          id?: number
          mapped_at?: string | null
          provider: string
          provider_uid: string
        }
        Update: {
          external_event_id?: number
          id?: number
          mapped_at?: string | null
          provider?: string
          provider_uid?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_event_mappings_external_event_id_fkey"
            columns: ["external_event_id"]
            isOneToOne: false
            referencedRelation: "external_events"
            referencedColumns: ["id"]
          },
        ]
      }
      external_event_tasks: {
        Row: {
          completed: boolean | null
          created_at: string | null
          description: string | null
          id: string
          local_meta_id: string
          reminder_minutes: number | null
          task_template_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          completed?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: string
          local_meta_id: string
          reminder_minutes?: number | null
          task_template_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          completed?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: string
          local_meta_id?: string
          reminder_minutes?: number | null
          task_template_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_event_tasks_local_meta_id_fkey"
            columns: ["local_meta_id"]
            isOneToOne: false
            referencedRelation: "events_local_meta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_event_tasks_task_template_id_fkey"
            columns: ["task_template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      external_events: {
        Row: {
          deleted: boolean | null
          dtstart_utc: string | null
          external_last_modified: string | null
          first_seen: string | null
          id: number
          last_seen: string | null
          location: string | null
          primary_provider_uid: string | null
          provider: string
          raw_hash: string | null
          raw_payload: string | null
          summary: string | null
        }
        Insert: {
          deleted?: boolean | null
          dtstart_utc?: string | null
          external_last_modified?: string | null
          first_seen?: string | null
          id?: number
          last_seen?: string | null
          location?: string | null
          primary_provider_uid?: string | null
          provider: string
          raw_hash?: string | null
          raw_payload?: string | null
          summary?: string | null
        }
        Update: {
          deleted?: boolean | null
          dtstart_utc?: string | null
          external_last_modified?: string | null
          first_seen?: string | null
          id?: number
          last_seen?: string | null
          location?: string | null
          primary_provider_uid?: string | null
          provider?: string
          raw_hash?: string | null
          raw_payload?: string | null
          summary?: string | null
        }
        Relationships: []
      }
      hidden_activity_categories: {
        Row: {
          category_id: string
          created_at: string | null
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string | null
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hidden_activity_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "activity_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      hidden_task_templates: {
        Row: {
          created_at: string
          task_template_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          task_template_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          task_template_id?: string
          user_id?: string
        }
        Relationships: []
      }
      local_event_meta: {
        Row: {
          category_id: string | null
          external_event_id: number | null
          id: number
          last_local_modified: string | null
          overrides: Json | null
          user_id: string | null
        }
        Insert: {
          category_id?: string | null
          external_event_id?: number | null
          id?: number
          last_local_modified?: string | null
          overrides?: Json | null
          user_id?: string | null
        }
        Update: {
          category_id?: string | null
          external_event_id?: number | null
          id?: number
          last_local_modified?: string | null
          overrides?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "local_event_meta_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "activity_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "local_event_meta_external_event_id_fkey"
            columns: ["external_event_id"]
            isOneToOne: false
            referencedRelation: "external_events"
            referencedColumns: ["id"]
          },
        ]
      }
      player_invitations: {
        Row: {
          accepted_at: string | null
          admin_id: string
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invitation_code: string
          player_id: string | null
          player_name: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          admin_id: string
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          invitation_code: string
          player_id?: string | null
          player_name: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          admin_id?: string
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invitation_code?: string
          player_id?: string | null
          player_name?: string
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          full_name: string | null
          id: string
          phone_number: string | null
          subscription_product_id: string | null
          subscription_receipt: string | null
          subscription_tier: string | null
          subscription_updated_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          phone_number?: string | null
          subscription_product_id?: string | null
          subscription_receipt?: string | null
          subscription_tier?: string | null
          subscription_updated_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          phone_number?: string | null
          subscription_product_id?: string | null
          subscription_receipt?: string | null
          subscription_tier?: string | null
          subscription_updated_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          created_at: string | null
          id: string
          max_players: number
          name: string
          price_dkk: number
          stripe_price_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          max_players: number
          name: string
          price_dkk: number
          stripe_price_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          max_players?: number
          name?: string
          price_dkk?: number
          stripe_price_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          admin_id: string
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          trial_start: string | null
          updated_at: string | null
        }
        Insert: {
          admin_id: string
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id: string
          status: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_id?: string
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      task_template_categories: {
        Row: {
          category_id: string
          created_at: string
          id: string
          task_template_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          task_template_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          task_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_template_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "activity_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_template_categories_task_template_id_fkey"
            columns: ["task_template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      task_template_self_feedback: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          note: string | null
          rating: number | null
          task_template_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          note?: string | null
          rating?: number | null
          task_template_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          note?: string | null
          rating?: number | null
          task_template_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_template_self_feedback_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_template_self_feedback_task_template_id_fkey"
            columns: ["task_template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      task_template_subtasks: {
        Row: {
          created_at: string
          id: string
          sort_order: number
          task_template_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          sort_order?: number
          task_template_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          sort_order?: number
          task_template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_template_subtasks_task_template_id_fkey"
            columns: ["task_template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          after_training_delay_minutes: number | null
          after_training_enabled: boolean
          created_at: string
          description: string | null
          id: string
          player_id: string | null
          reminder_minutes: number | null
          source_folder: string | null
          team_id: string | null
          title: string
          updated_at: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          after_training_delay_minutes?: number | null
          after_training_enabled?: boolean
          created_at?: string
          description?: string | null
          id?: string
          player_id?: string | null
          reminder_minutes?: number | null
          source_folder?: string | null
          team_id?: string | null
          title: string
          updated_at?: string
          user_id: string
          video_url?: string | null
        }
        Update: {
          after_training_delay_minutes?: number | null
          after_training_enabled?: boolean
          created_at?: string
          description?: string | null
          id?: string
          player_id?: string | null
          reminder_minutes?: number | null
          source_folder?: string | null
          team_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          category_ids: string[] | null
          completed: boolean
          created_at: string
          description: string | null
          id: string
          is_template: boolean
          reminder_minutes: number | null
          subtasks: Json | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_ids?: string[] | null
          completed?: boolean
          created_at?: string
          description?: string | null
          id?: string
          is_template?: boolean
          reminder_minutes?: number | null
          subtasks?: Json | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category_ids?: string[] | null
          completed?: boolean
          created_at?: string
          description?: string | null
          id?: string
          is_template?: boolean
          reminder_minutes?: number | null
          subtasks?: Json | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string | null
          id: string
          player_id: string
          team_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          player_id: string
          team_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          player_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          admin_id: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          admin_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          admin_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      training_reflections: {
        Row: {
          activity_id: string
          category_id: string
          created_at: string
          id: string
          note: string | null
          rating: number | null
          user_id: string
        }
        Insert: {
          activity_id: string
          category_id: string
          created_at?: string
          id?: string
          note?: string | null
          rating?: number | null
          user_id: string
        }
        Update: {
          activity_id?: string
          category_id?: string
          created_at?: string
          id?: string
          note?: string | null
          rating?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_reflections_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: true
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      trophies: {
        Row: {
          completed_tasks: number
          created_at: string
          id: string
          percentage: number
          total_tasks: number
          type: string
          user_id: string
          week: number
          year: number
        }
        Insert: {
          completed_tasks?: number
          created_at?: string
          id?: string
          percentage: number
          total_tasks?: number
          type: string
          user_id: string
          week: number
          year: number
        }
        Update: {
          completed_tasks?: number
          created_at?: string
          id?: string
          percentage?: number
          total_tasks?: number
          type?: string
          user_id?: string
          week?: number
          year?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      weekly_performance: {
        Row: {
          completed_tasks: number
          created_at: string
          id: string
          percentage: number
          player_id: string | null
          team_id: string | null
          total_tasks: number
          trophy_type: string
          user_id: string
          week_number: number
          year: number
        }
        Insert: {
          completed_tasks?: number
          created_at?: string
          id?: string
          percentage: number
          player_id?: string | null
          team_id?: string | null
          total_tasks?: number
          trophy_type: string
          user_id: string
          week_number: number
          year: number
        }
        Update: {
          completed_tasks?: number
          created_at?: string
          id?: string
          percentage?: number
          player_id?: string | null
          team_id?: string | null
          total_tasks?: number
          trophy_type?: string
          user_id?: string
          week_number?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_performance_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      activities_combined: {
        Row: {
          activity_date: string | null
          activity_time: string | null
          category_id: string | null
          category_updated_at: string | null
          created_at: string | null
          custom_fields: Json | null
          description: string | null
          external_calendar_id: string | null
          external_event_id: string | null
          external_event_uid: string | null
          external_last_modified: string | null
          id: string | null
          is_all_day: boolean | null
          is_external: boolean | null
          last_local_modified: string | null
          local_meta_id: string | null
          location: string | null
          manually_set_category: boolean | null
          pinned: boolean | null
          provider: string | null
          reminders: Json | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_weekly_performance: {
        Args: { p_user_id: string; p_week_number: number; p_year: number }
        Returns: {
          completed_tasks: number
          percentage: number
          total_tasks: number
          trophy_type: string
        }[]
      }
      create_admin_player_relationship: {
        Args: { p_admin_id: string; p_player_id: string }
        Returns: undefined
      }
      create_player_profile: {
        Args: {
          p_full_name: string
          p_phone_number?: string
          p_user_id: string
        }
        Returns: undefined
      }
      create_player_role: { Args: { p_user_id: string }; Returns: undefined }
      create_tasks_for_activity: {
        Args: { p_activity_id: string }
        Returns: undefined
      }
      create_tasks_for_external_event: {
        Args: { p_local_meta_id: string }
        Returns: undefined
      }
      fix_missing_activity_tasks: {
        Args: never
        Returns: {
          activity_id: string
          tasks_created: number
        }[]
      }
      get_player_admins: {
        Args: { p_player_id: string }
        Returns: {
          admin_email: string
          admin_id: string
          created_at: string
        }[]
      }
      get_subscription_status: {
        Args: { user_id: string }
        Returns: {
          current_period_end: string
          current_players: number
          has_subscription: boolean
          max_players: number
          plan_name: string
          status: string
          trial_end: string
        }[]
      }
      get_user_role: { Args: { p_user_id: string }; Returns: string }
      is_admin: { Args: { p_user_id: string }; Returns: boolean }
      migrate_external_activities: {
        Args: never
        Returns: {
          error_count: number
          migrated_count: number
        }[]
      }
      seed_default_data_for_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      update_all_tasks_from_template: {
        Args: { p_template_id: string }
        Returns: undefined
      }
      update_weekly_performance: {
        Args: { p_user_id: string; p_week_number: number; p_year: number }
        Returns: undefined
      }
      upsert_after_training_feedback_task: {
        Args: {
          p_activity_id: string
          p_base_title: string
          p_task_template_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
