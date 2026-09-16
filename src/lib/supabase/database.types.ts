import type {
  AccountStatus,
  AccountType,
  ApprovalStatus,
  OnboardingStatus,
} from "../auth/types";
import type {
  CredentialStatus,
  EstimateItemKind,
  EstimateStatus,
  OpportunityStatus,
  ProjectCompleteness,
  ProjectStatus,
  QuestionKind,
  ServiceAreaMode,
  TimingPreference,
} from "../marketplace/types";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          first_name: string;
          last_name: string;
          phone: string | null;
          avatar_url: string | null;
          account_type: AccountType;
          account_status: AccountStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          first_name?: string;
          last_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
          account_type?: AccountType;
          account_status?: AccountStatus;
        };
        Update: {
          first_name?: string;
          last_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
        };
        Relationships: [];
      };
      contractor_profiles: {
        Row: {
          id: string;
          profile_id: string;
          business_name: string;
          primary_trade: string | null;
          service_area: string | null;
          years_experience: number | null;
          license_number: string | null;
          insurance_carrier: string | null;
          website_url: string | null;
          bio: string | null;
          headline: string | null;
          accepting_work: boolean;
          min_job_cents: number | null;
          max_job_cents: number | null;
          onboarding_status: OnboardingStatus;
          approval_status: ApprovalStatus;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          profile_id: string;
          business_name?: string;
          primary_trade?: string | null;
          service_area?: string | null;
          years_experience?: number | null;
          license_number?: string | null;
          insurance_carrier?: string | null;
          website_url?: string | null;
          bio?: string | null;
          headline?: string | null;
          accepting_work?: boolean;
          min_job_cents?: number | null;
          max_job_cents?: number | null;
        };
        Update: {
          business_name?: string;
          primary_trade?: string | null;
          service_area?: string | null;
          years_experience?: number | null;
          license_number?: string | null;
          insurance_carrier?: string | null;
          website_url?: string | null;
          bio?: string | null;
          headline?: string | null;
          accepting_work?: boolean;
          min_job_cents?: number | null;
          max_job_cents?: number | null;
          onboarding_status?: OnboardingStatus;
        };
        Relationships: [];
      };
      verifier_profiles: {
        Row: {
          id: string;
          profile_id: string;
          coverage_area: string | null;
          bio: string | null;
          onboarding_status: OnboardingStatus;
          approval_status: ApprovalStatus;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          profile_id: string;
          coverage_area?: string | null;
          bio?: string | null;
        };
        Update: {
          coverage_area?: string | null;
          bio?: string | null;
          onboarding_status?: OnboardingStatus;
        };
        Relationships: [];
      };
      agreements: {
        Row: {
          id: string;
          slug: string;
          title: string;
          version: number;
          body: string;
          is_current: boolean;
          created_at: string;
        };
        Insert: {
          slug: string;
          title: string;
          version?: number;
          body: string;
          is_current?: boolean;
        };
        Update: {
          title?: string;
          body?: string;
          is_current?: boolean;
        };
        Relationships: [];
      };
      agreement_acceptances: {
        Row: {
          id: string;
          agreement_id: string;
          profile_id: string;
          accepted_at: string;
          user_agent: string | null;
        };
        Insert: {
          agreement_id: string;
          profile_id: string;
          user_agent?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      platform_settings: {
        Row: {
          key: string;
          value_int: number | null;
          value_text: string | null;
          description: string | null;
        };
        Insert: {
          key: string;
          value_int?: number | null;
          value_text?: string | null;
          description?: string | null;
        };
        Update: {
          value_int?: number | null;
          value_text?: string | null;
          description?: string | null;
        };
        Relationships: [];
      };
      service_categories: {
        Row: {
          id: string;
          slug: string;
          name: string;
          blurb: string;
          sort_order: number;
          is_active: boolean;
          is_regulated: boolean;
          requires_verified_credential: boolean;
        };
        Insert: {
          slug: string;
          name: string;
          blurb?: string;
          sort_order?: number;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          blurb?: string;
          is_active?: boolean;
        };
        Relationships: [];
      };
      service_questions: {
        Row: {
          id: string;
          category_id: string;
          prompt: string;
          help_text: string | null;
          kind: QuestionKind;
          options: Json;
          is_required: boolean;
          sort_order: number;
          is_active: boolean;
        };
        Insert: {
          category_id: string;
          prompt: string;
          help_text?: string | null;
          kind?: QuestionKind;
          options?: Json;
          is_required?: boolean;
          sort_order?: number;
        };
        Update: {
          prompt?: string;
          help_text?: string | null;
          is_required?: boolean;
          is_active?: boolean;
        };
        Relationships: [];
      };
      contractor_services: {
        Row: {
          id: string;
          contractor_profile_id: string;
          category_id: string;
          created_at: string;
        };
        Insert: { contractor_profile_id: string; category_id: string };
        Update: never;
        Relationships: [];
      };
      contractor_service_areas: {
        Row: {
          id: string;
          contractor_profile_id: string;
          mode: ServiceAreaMode;
          center_zip: string | null;
          center_lat: number | null;
          center_lng: number | null;
          radius_miles: number | null;
          zip_codes: string[];
          label: string | null;
        };
        Insert: {
          contractor_profile_id: string;
          mode?: ServiceAreaMode;
          center_zip?: string | null;
          center_lat?: number | null;
          center_lng?: number | null;
          radius_miles?: number | null;
          zip_codes?: string[];
          label?: string | null;
        };
        Update: {
          mode?: ServiceAreaMode;
          center_zip?: string | null;
          center_lat?: number | null;
          center_lng?: number | null;
          radius_miles?: number | null;
          zip_codes?: string[];
          label?: string | null;
        };
        Relationships: [];
      };
      contractor_portfolio: {
        Row: {
          id: string;
          contractor_profile_id: string;
          title: string;
          description: string | null;
          storage_path: string;
          sort_order: number;
        };
        Insert: {
          contractor_profile_id: string;
          title?: string;
          description?: string | null;
          storage_path: string;
          sort_order?: number;
        };
        Update: {
          title?: string;
          description?: string | null;
          storage_path?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      contractor_credentials: {
        Row: {
          id: string;
          contractor_profile_id: string;
          kind: string;
          label: string;
          document_path: string | null;
          status: CredentialStatus;
          expires_at: string | null;
          reviewer_notes: string | null;
        };
        Insert: {
          contractor_profile_id: string;
          kind?: string;
          label: string;
          document_path?: string | null;
          status?: CredentialStatus;
        };
        Update: {
          label?: string;
          document_path?: string | null;
          status?: CredentialStatus;
          expires_at?: string | null;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          customer_id: string;
          category_id: string | null;
          title: string;
          description: string;
          status: ProjectStatus;
          completeness: ProjectCompleteness;
          city: string | null;
          state: string | null;
          zip_code: string | null;
          timing: TimingPreference | null;
          preferred_date: string | null;
          budget_min_cents: number | null;
          budget_max_cents: number | null;
          draft_step: number;
          selected_contractor_profile_id: string | null;
          selected_estimate_id: string | null;
          posted_at: string | null;
          selected_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          customer_id: string;
          category_id?: string | null;
          title?: string;
          description?: string;
          status?: ProjectStatus;
          city?: string | null;
          state?: string | null;
          zip_code?: string | null;
          timing?: TimingPreference | null;
          preferred_date?: string | null;
          budget_min_cents?: number | null;
          budget_max_cents?: number | null;
          draft_step?: number;
        };
        Update: {
          category_id?: string | null;
          title?: string;
          description?: string;
          city?: string | null;
          state?: string | null;
          zip_code?: string | null;
          timing?: TimingPreference | null;
          preferred_date?: string | null;
          budget_min_cents?: number | null;
          budget_max_cents?: number | null;
          draft_step?: number;
        };
        Relationships: [];
      };
      project_private_locations: {
        Row: {
          project_id: string;
          street_line1: string | null;
          street_line2: string | null;
          lat: number | null;
          lng: number | null;
        };
        Insert: {
          project_id: string;
          street_line1?: string | null;
          street_line2?: string | null;
          lat?: number | null;
          lng?: number | null;
        };
        Update: {
          street_line1?: string | null;
          street_line2?: string | null;
          lat?: number | null;
          lng?: number | null;
        };
        Relationships: [];
      };
      project_photos: {
        Row: { id: string; project_id: string; storage_path: string; sort_order: number };
        Insert: { project_id: string; storage_path: string; sort_order?: number };
        Update: { sort_order?: number };
        Relationships: [];
      };
      project_answers: {
        Row: {
          id: string;
          project_id: string;
          question_id: string;
          answer_text: string | null;
          answer_json: Json | null;
        };
        Insert: {
          project_id: string;
          question_id: string;
          answer_text?: string | null;
          answer_json?: Json | null;
        };
        Update: { answer_text?: string | null; answer_json?: Json | null };
        Relationships: [];
      };
      project_status_history: {
        Row: {
          id: string;
          project_id: string;
          from_status: ProjectStatus | null;
          to_status: ProjectStatus;
          changed_by: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      matches: {
        Row: {
          id: string;
          project_id: string;
          contractor_profile_id: string;
          score: number;
          reasons: Json;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      opportunities: {
        Row: {
          id: string;
          project_id: string;
          contractor_profile_id: string;
          match_id: string | null;
          status: OpportunityStatus;
          available_at: string;
          responded_at: string | null;
          expires_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      opportunity_slots: {
        Row: {
          project_id: string;
          slot_number: number;
          opportunity_id: string;
          contractor_profile_id: string;
          claimed_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      estimate_questions: {
        Row: {
          id: string;
          project_id: string;
          opportunity_id: string;
          asked_by_contractor_profile_id: string;
          prompt: string;
          answer_text: string | null;
          answered_at: string | null;
          created_at: string;
        };
        Insert: {
          project_id: string;
          opportunity_id: string;
          asked_by_contractor_profile_id: string;
          prompt: string;
        };
        Update: { prompt?: string; answer_text?: string | null };
        Relationships: [];
      };
      estimates: {
        Row: {
          id: string;
          project_id: string;
          opportunity_id: string;
          contractor_profile_id: string;
          status: EstimateStatus;
          notes: string | null;
          subtotal_cents: number;
          fee_bps: number;
          fee_cents: number;
          contractor_earnings_cents: number;
          total_cents: number;
          valid_until: string | null;
          duration_hours: number | null;
          available_from: string | null;
          submitted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          opportunity_id: string;
          contractor_profile_id: string;
          notes?: string | null;
          valid_until?: string | null;
          duration_hours?: number | null;
          available_from?: string | null;
        };
        Update: {
          notes?: string | null;
          valid_until?: string | null;
          duration_hours?: number | null;
          available_from?: string | null;
        };
        Relationships: [];
      };
      estimate_items: {
        Row: {
          id: string;
          estimate_id: string;
          label: string;
          quantity: number;
          unit_cents: number;
          line_total_cents: number;
          kind: EstimateItemKind;
          unit_label: string;
          sort_order: number;
        };
        Insert: {
          estimate_id: string;
          label: string;
          quantity?: number;
          unit_cents?: number;
          kind?: EstimateItemKind;
          unit_label?: string;
          sort_order?: number;
        };
        Update: {
          label?: string;
          quantity?: number;
          unit_cents?: number;
          kind?: EstimateItemKind;
          unit_label?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      contractor_public_profiles: {
        Row: {
          id: string;
          business_name: string;
          headline: string | null;
          primary_trade: string | null;
          years_experience: number | null;
          bio: string | null;
          website_url: string | null;
          accepting_work: boolean;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      contractor_verified_credential_badges: {
        Row: {
          id: string;
          contractor_profile_id: string;
          kind: string;
          label: string;
          status: CredentialStatus;
          expires_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      contractor_public_services: {
        Row: {
          id: string;
          contractor_profile_id: string;
          category_id: string;
          category_slug: string;
          category_name: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      contractor_public_areas: {
        Row: {
          id: string;
          contractor_profile_id: string;
          mode: ServiceAreaMode;
          center_zip: string | null;
          radius_miles: number | null;
          zip_codes: string[] | null;
          label: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      contractor_public_portfolio: {
        Row: {
          id: string;
          contractor_profile_id: string;
          title: string;
          description: string | null;
          storage_path: string;
          sort_order: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      current_fee_bps: { Args: Record<string, never>; Returns: number };
      fee_preview: { Args: { p_total_cents: number }; Returns: Json };
      current_contractor_profile_id: { Args: Record<string, never>; Returns: string };
      post_project: { Args: { p_project_id: string }; Returns: Json };
      accept_opportunity: { Args: { p_opportunity_id: string }; Returns: Json };
      pass_opportunity: { Args: { p_opportunity_id: string }; Returns: Json };
      submit_estimate: { Args: { p_estimate_id: string }; Returns: Json };
      withdraw_estimate: { Args: { p_estimate_id: string }; Returns: Json };
      select_estimate: { Args: { p_project_id: string; p_estimate_id: string }; Returns: Json };
    };
    Enums: {
      account_type: AccountType;
      account_status: AccountStatus;
      onboarding_status: OnboardingStatus;
      approval_status: ApprovalStatus;
      project_status: ProjectStatus;
      project_completeness: ProjectCompleteness;
      timing_preference: TimingPreference;
      opportunity_status: OpportunityStatus;
      estimate_status: EstimateStatus;
      credential_status: CredentialStatus;
      service_area_mode: ServiceAreaMode;
      question_kind: QuestionKind;
      estimate_item_kind: EstimateItemKind;
    };
  };
};
