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
          agent_key: string
          color: string | null
          created_at: string
          emoji: string | null
          id: string
          name: string
          project_id: string
          role: string | null
        }
        Insert: {
          agent_key: string
          color?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          name: string
          project_id: string
          role?: string | null
        }
        Update: {
          agent_key?: string
          color?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          name?: string
          project_id?: string
          role?: string | null
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
      cron_create_requests: {
        Row: {
          completed_at: string | null
          id: string
          instructions: string | null
          name: string
          picked_up_at: string | null
          project_id: string
          requested_at: string
          requested_by: string | null
          result: Json | null
          schedule_expr: string
          schedule_kind: string | null
          status: string
          tz: string | null
        }
        Insert: {
          completed_at?: string | null
          id?: string
          instructions?: string | null
          name: string
          picked_up_at?: string | null
          project_id: string
          requested_at?: string
          requested_by?: string | null
          result?: Json | null
          schedule_expr: string
          schedule_kind?: string | null
          status?: string
          tz?: string | null
        }
        Update: {
          completed_at?: string | null
          id?: string
          instructions?: string | null
          name?: string
          picked_up_at?: string | null
          project_id?: string
          requested_at?: string
          requested_by?: string | null
          result?: Json | null
          schedule_expr?: string
          schedule_kind?: string | null
          status?: string
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
          enabled: boolean
          id: string
          instructions: string | null
          job_id: string
          last_duration_ms: number | null
          last_run_at: string | null
          last_status: string | null
          name: string
          next_run_at: string | null
          project_id: string
          schedule_expr: string | null
          schedule_kind: string | null
          tz: string | null
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id?: string
          instructions?: string | null
          job_id: string
          last_duration_ms?: number | null
          last_run_at?: string | null
          last_status?: string | null
          name: string
          next_run_at?: string | null
          project_id: string
          schedule_expr?: string | null
          schedule_kind?: string | null
          tz?: string | null
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: string
          instructions?: string | null
          job_id?: string
          last_duration_ms?: number | null
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          next_run_at?: string | null
          project_id?: string
          schedule_expr?: string | null
          schedule_kind?: string | null
          tz?: string | null
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
          content_text: string | null
          created_at: string
          id: string
          mime_type: string | null
          project_id: string
          size_bytes: number | null
          source_type: string
          storage_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content_text?: string | null
          created_at?: string
          id?: string
          mime_type?: string | null
          project_id: string
          size_bytes?: number | null
          source_type: string
          storage_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content_text?: string | null
          created_at?: string
          id?: string
          mime_type?: string | null
          project_id?: string
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
