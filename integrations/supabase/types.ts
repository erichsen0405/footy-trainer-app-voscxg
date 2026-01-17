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
          activity_time: string
          category_id: string | null
          created_at: string
          external_calendar_id: string | null
          external_event_id: string | null
          id: string
          is_external: boolean
          location: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_date: string
          activity_time: string
          category_id?: string | null
          created_at?: string
          external_calendar_id?: string | null
          external_event_id?: string | null
          id?: string
          is_external?: boolean
          location?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_date?: string
          activity_time?: string
          category_id?: string | null
          created_at?: string
          external_calendar_id?: string | null
          external_event_id?: string | null
          id?: string
          is_external?: boolean
          location?: string | null
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
        ]
      }
      activity_categories: {
        Row: {
          color: string
          created_at: string
          emoji: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color: string
          created_at?: string
          emoji: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          emoji?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      external_calendars: {
        Row: {
          created_at: string
          enabled: boolean
          event_count: number | null
          ics_url: string
          id: string
          last_fetched: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          event_count?: number | null
          ics_url: string
          id?: string
          last_fetched?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          event_count?: number | null
          ics_url?: string
          id?: string
          last_fetched?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          created_at: string
          description: string | null
          id: string
          reminder_minutes: number | null
          after_training_delay_minutes: number | null
          after_training_enabled: boolean
          player_id: string | null
          team_id: string | null
          title: string
          updated_at: string
          user_id: string
          video_url: string | null
          source_folder: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          reminder_minutes?: number | null
          after_training_delay_minutes?: number | null
          after_training_enabled?: boolean
          player_id?: string | null
          team_id?: string | null
          title: string
          updated_at?: string
          user_id: string
          video_url?: string | null
          source_folder?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          reminder_minutes?: number | null
          after_training_delay_minutes?: number | null
          after_training_enabled?: boolean
          player_id?: string | null
          team_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          video_url?: string | null
          source_folder?: string | null
        }
        Relationships: []
      }
      weekly_performance: {
        Row: {
          completed_tasks: number
          created_at: string
          id: string
          percentage: number
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
          total_tasks?: number
          trophy_type?: string
          user_id?: string
          week_number?: number
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
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
        Args: { p_user_id: string; p_full_name: string; p_phone_number?: string }
        Returns: undefined
      }
      create_player_role: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      create_tasks_for_activity: {
        Args: { p_activity_id: string }
        Returns: undefined
      }
      seed_default_data_for_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      update_weekly_performance: {
        Args: { p_user_id: string; p_week_number: number; p_year: number }
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
