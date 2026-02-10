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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          actor_agent_key: string | null
          created_at: string
          id: string
          message: string
          project_id: string
          summary: string | null
          task_id: string | null
          type: string
        }
        Insert: {
          actor_agent_key?: string | null
          created_at?: string
          id?: string
          message: string
          project_id: string
          summary?: string | null
          task_id?: string | null
          type: string
        }
        Update: {
          actor_agent_key?: string | null
          created_at?: string
          id?: string
          message?: string
          project_id?: string
          summary?: string | null
          task_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_provision_requests: {
        Row: {
          agent_id_short: string
          agent_key: string
          completed_at: string | null
          display_name: string
          emoji: string | null
          id: string
          picked_up_at: string | null
          project_id: string
          requested_at: string
          result: Json | null
          role_short: string | null
          status: string
        }
        Insert: {
          agent_id_short: string
          agent_key: string
          completed_at?: string | null
          display_name: string
          emoji?: string | null
          id?: string
          picked_up_at?: string | null
          project_id: string
          requested_at?: string
          result?: Json | null
          role_short?: string | null
          status?: string
        }
        Update: {
          agent_id_short?: string
          agent_key?: string
          completed_at?: string | null
          display_name?: string
          emoji?: string | null
          id?: string
          picked_up_at?: string | null
          project_id?: string
          requested_at?: string
          result?: Json | null
          role_short?: string | null
          status?: string
        }
        Relationships: []
      }
      agent_status: {
        Row: {
          agent_key: string
          current_task_id: string | null
          id: string
          last_activity_at: string
          last_heartbeat_at: string | null
          note: string | null
          project_id: string
          state: string
        }
        Insert: {
          agent_key: string
          current_task_id?: string | null
          id?: string
          last_activity_at?: string
          last_heartbeat_at?: string | null
          note?: string | null
          project_id: string
          state?: string
        }
        Update: {
          agent_key?: string
          current_task_id?: string | null
          id?: string
          last_activity_at?: string
          last_heartbeat_at?: string | null
          note?: string | null
          project_id?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_status_current_task_id_fkey"
            columns: ["current_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_status_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          agent_id_short: string | null
          agent_key: string
          color: string | null
          created_at: string
          emoji: string | null
          id: string
          name: string
          project_id: string
          provisioned: boolean
          role: string | null
          workspace_path: string | null
        }
        Insert: {
          agent_id_short?: string | null
          agent_key: string
          color?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          name: string
          project_id: string
          provisioned?: boolean
          role?: string | null
          workspace_path?: string | null
        }
        Update: {
          agent_id_short?: string | null
          agent_key?: string
          color?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          name?: string
          project_id?: string
          provisioned?: boolean
          role?: string | null
          workspace_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_docs: {
        Row: {
          agent_key: string | null
          content: string
          doc_type: string
          id: string
          project_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agent_key?: string | null
          content?: string
          doc_type: string
          id?: string
          project_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agent_key?: string | null
          content?: string
          doc_type?: string
          id?: string
          project_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brain_docs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      channels_mirror: {
        Row: {
          channel_id: string
          id: string
          last_activity: string
          name: string
          project_id: string
          status: string
          synced_at: string
          type: string
        }
        Insert: {
          channel_id: string
          id?: string
          last_activity?: string
          name: string
          project_id: string
          status?: string
          synced_at?: string
          type?: string
        }
        Update: {
          channel_id?: string
          id?: string
          last_activity?: string
          name?: string
          project_id?: string
          status?: string
          synced_at?: string
          type?: string
        }
        Relationships: []
      }
      cron_create_requests: {
        Row: {
          completed_at: string | null
          context_policy: string | null
          id: string
          instructions: string | null
          job_intent: string | null
          name: string
          picked_up_at: string | null
          project_id: string
          requested_at: string
          requested_by: string | null
          result: Json | null
          schedule_expr: string
          schedule_kind: string | null
          status: string
          target_agent_key: string | null
          tz: string | null
        }
        Insert: {
          completed_at?: string | null
          context_policy?: string | null
          id?: string
          instructions?: string | null
          job_intent?: string | null
          name: string
          picked_up_at?: string | null
          project_id: string
          requested_at?: string
          requested_by?: string | null
          result?: Json | null
          schedule_expr: string
          schedule_kind?: string | null
          status?: string
          target_agent_key?: string | null
          tz?: string | null
        }
        Update: {
          completed_at?: string | null
          context_policy?: string | null
          id?: string
          instructions?: string | null
          job_intent?: string | null
          name?: string
          picked_up_at?: string | null
          project_id?: string
          requested_at?: string
          requested_by?: string | null
          result?: Json | null
          schedule_expr?: string
          schedule_kind?: string | null
          status?: string
          target_agent_key?: string | null
          tz?: string | null
        }
        Relationships: []
      }
      cron_delete_requests: {
        Row: {
          completed_at: string | null
          id: string
          job_id: string
          picked_up_at: string | null
          project_id: string
          requested_at: string
          requested_by: string | null
          result: Json | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          job_id: string
          picked_up_at?: string | null
          project_id: string
          requested_at?: string
          requested_by?: string | null
          result?: Json | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          job_id?: string
          picked_up_at?: string | null
          project_id?: string
          requested_at?: string
          requested_by?: string | null
          result?: Json | null
          status?: string
        }
        Relationships: []
      }
      cron_job_patch_requests: {
        Row: {
          completed_at: string | null
          id: string
          job_id: string
          patch_json: Json
          picked_up_at: string | null
          project_id: string
          requested_at: string
          requested_by: string | null
          result: Json | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          job_id: string
          patch_json: Json
          picked_up_at?: string | null
          project_id: string
          requested_at?: string
          requested_by?: string | null
          result?: Json | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          job_id?: string
          patch_json?: Json
          picked_up_at?: string | null
          project_id?: string
          requested_at?: string
          requested_by?: string | null
          result?: Json | null
          status?: string
        }
        Relationships: []
      }
      cron_mirror: {
        Row: {
          context_policy: string | null
          enabled: boolean
          id: string
          instructions: string | null
          job_id: string
          job_intent: string | null
          last_duration_ms: number | null
          last_run_at: string | null
          last_status: string | null
          name: string
          next_run_at: string | null
          project_id: string
          schedule_expr: string | null
          schedule_kind: string | null
          target_agent_key: string | null
          tz: string | null
          ui_label: string | null
          updated_at: string
        }
        Insert: {
          context_policy?: string | null
          enabled?: boolean
          id?: string
          instructions?: string | null
          job_id: string
          job_intent?: string | null
          last_duration_ms?: number | null
          last_run_at?: string | null
          last_status?: string | null
          name: string
          next_run_at?: string | null
          project_id: string
          schedule_expr?: string | null
          schedule_kind?: string | null
          target_agent_key?: string | null
          tz?: string | null
          ui_label?: string | null
          updated_at?: string
        }
        Update: {
          context_policy?: string | null
          enabled?: boolean
          id?: string
          instructions?: string | null
          job_id?: string
          job_intent?: string | null
          last_duration_ms?: number | null
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          next_run_at?: string | null
          project_id?: string
          schedule_expr?: string | null
          schedule_kind?: string | null
          target_agent_key?: string | null
          tz?: string | null
          ui_label?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cron_run_requests: {
        Row: {
          completed_at: string | null
          id: string
          job_id: string
          picked_up_at: string | null
          project_id: string
          requested_at: string
          requested_by: string | null
          result: Json | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          job_id: string
          picked_up_at?: string | null
          project_id: string
          requested_at?: string
          requested_by?: string | null
          result?: Json | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          job_id?: string
          picked_up_at?: string | null
          project_id?: string
          requested_at?: string
          requested_by?: string | null
          result?: Json | null
          status?: string
        }
        Relationships: []
      }
      project_chat_messages: {
        Row: {
          author: string
          created_at: string
          id: string
          message: string
          project_id: string
          target_agent_key: string | null
          thread_id: string | null
        }
        Insert: {
          author: string
          created_at?: string
          id?: string
          message: string
          project_id: string
          target_agent_key?: string | null
          thread_id?: string | null
        }
        Update: {
          author?: string
          created_at?: string
          id?: string
          message?: string
          project_id?: string
          target_agent_key?: string | null
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "project_chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      project_chat_threads: {
        Row: {
          created_at: string
          id: string
          project_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_documents: {
        Row: {
          agent_key: string | null
          content_text: string | null
          created_at: string
          doc_notes: Json | null
          doc_type: string | null
          id: string
          mime_type: string | null
          pinned: boolean | null
          project_id: string
          sensitivity: string | null
          size_bytes: number | null
          source_type: string
          storage_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          agent_key?: string | null
          content_text?: string | null
          created_at?: string
          doc_notes?: Json | null
          doc_type?: string | null
          id?: string
          mime_type?: string | null
          pinned?: boolean | null
          project_id: string
          sensitivity?: string | null
          size_bytes?: number | null
          source_type: string
          storage_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          agent_key?: string | null
          content_text?: string | null
          created_at?: string
          doc_notes?: Json | null
          doc_type?: string | null
          id?: string
          mime_type?: string | null
          pinned?: boolean | null
          project_id?: string
          sensitivity?: string | null
          size_bytes?: number | null
          source_type?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_settings: {
        Row: {
          id: string
          key: string
          project_id: string
          updated_at: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          project_id: string
          updated_at?: string
          value: string
        }
        Update: {
          id?: string
          key?: string
          project_id?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          id: string
          name: string
          workspace_path: string | null
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          workspace_path?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          workspace_path?: string | null
        }
        Relationships: []
      }
      skill_requests: {
        Row: {
          created_at: string
          id: string
          identifier: string
          project_id: string
          result_message: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          identifier: string
          project_id: string
          result_message?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          identifier?: string
          project_id?: string
          result_message?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      skills_mirror: {
        Row: {
          description: string
          extra_json: Json | null
          id: string
          installed: boolean
          last_updated: string
          name: string
          project_id: string
          skill_id: string
          synced_at: string
          version: string
        }
        Insert: {
          description?: string
          extra_json?: Json | null
          id?: string
          installed?: boolean
          last_updated?: string
          name: string
          project_id: string
          skill_id: string
          synced_at?: string
          version?: string
        }
        Update: {
          description?: string
          extra_json?: Json | null
          id?: string
          installed?: boolean
          last_updated?: string
          name?: string
          project_id?: string
          skill_id?: string
          synced_at?: string
          version?: string
        }
        Relationships: []
      }
      task_comments: {
        Row: {
          author_agent_key: string | null
          content: string
          created_at: string
          id: string
          project_id: string
          task_id: string
        }
        Insert: {
          author_agent_key?: string | null
          content: string
          created_at?: string
          id?: string
          project_id: string
          task_id: string
        }
        Update: {
          author_agent_key?: string | null
          content?: string
          created_at?: string
          id?: string
          project_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_outputs: {
        Row: {
          content_text: string | null
          created_at: string
          created_by: string | null
          id: string
          link_url: string | null
          mime_type: string | null
          output_type: string
          project_id: string
          storage_path: string | null
          task_id: string
          title: string | null
        }
        Insert: {
          content_text?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          link_url?: string | null
          mime_type?: string | null
          output_type: string
          project_id: string
          storage_path?: string | null
          task_id: string
          title?: string | null
        }
        Update: {
          content_text?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          link_url?: string | null
          mime_type?: string | null
          output_type?: string
          project_id?: string
          storage_path?: string | null
          task_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_outputs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_outputs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_agent_key: string | null
          blocked_at: string | null
          blocked_reason: string | null
          context_snapshot: Json | null
          created_at: string
          description: string | null
          id: string
          is_proposed: boolean | null
          project_id: string
          rejected_at: string | null
          rejected_reason: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_agent_key?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          context_snapshot?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          is_proposed?: boolean | null
          project_id: string
          rejected_at?: string | null
          rejected_reason?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_agent_key?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          context_snapshot?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          is_proposed?: boolean | null
          project_id?: string
          rejected_at?: string | null
          rejected_reason?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
