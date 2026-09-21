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
          signup_fee_status?: import("../signupFee/constants").SignupFeeStatus;
          signup_fee_paid_at?: string | null;
          signup_fee_charge_id?: string | null;
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
          rejected_at: string | null;
          rejected_by: string | null;
          rejection_reason: string | null;
          info_requested_at: string | null;
          info_requested_by: string | null;
          info_request_message: string | null;
          identity_review_required: boolean;
          identity_review_at: string | null;
          identity_review_fields: string[];
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
          privacy_state: "PUBLIC_SAFE" | "PRIVATE" | "REVIEW_REQUIRED";
        };
        Insert: {
          contractor_profile_id: string;
          title?: string;
          description?: string | null;
          storage_path: string;
          sort_order?: number;
          privacy_state?: "PUBLIC_SAFE" | "PRIVATE" | "REVIEW_REQUIRED";
        };
        Update: {
          title?: string;
          description?: string | null;
          storage_path?: string;
          sort_order?: number;
          privacy_state?: "PUBLIC_SAFE" | "PRIVATE" | "REVIEW_REQUIRED";
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
          selected_booking_id: string | null;
          posted_at: string | null;
          selected_at: string | null;
          scope_revision: number;
          cancelled_at: string | null;
          cancel_reason: string | null;
          accepting_connections: boolean;
          connections_closed_at: string | null;
          connections_closed_by: string | null;
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
      project_notices: {
        Row: {
          id: string;
          project_id: string;
          audience: "CUSTOMER" | "CONTRACTOR" | "BOTH";
          kind: string;
          title: string;
          body: string;
          created_at: string;
          created_by: string | null;
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
          rank_order: number;
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
          withdrawn_at: string | null;
          first_viewed_at: string | null;
          last_viewed_at: string | null;
          view_count: number;
          accepted_at: string | null;
          declined_at: string | null;
          decline_reason: string | null;
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
      fee_schedules: {
        Row: {
          id: string;
          kind: import("../marketplace/types").FeeScheduleKind;
          version: number;
          name: string;
          is_active: boolean;
          min_fee_cents: number;
          max_fee_cents: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      fee_schedule_brackets: {
        Row: {
          id: string;
          schedule_id: string;
          min_amount_cents: number;
          max_amount_cents: number | null;
          rate_bps: number;
          sort_order: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      bookings: {
        Row: import("../marketplace/types").Booking;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      booking_events: {
        Row: {
          id: string;
          booking_id: string;
          actor_id: string | null;
          event_type: string;
          payload: Json;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      customer_contractor_relationships: {
        Row: import("../marketplace/types").CustomerContractorRelationship;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      change_orders: {
        Row: import("../marketplace/types").ChangeOrder;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      booking_reviews: {
        Row: import("../marketplace/types").BookingReview;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      booking_contact_access: {
        Row: import("../marketplace/types").BookingContactAccess;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      estimate_events: {
        Row: {
          id: string;
          estimate_id: string;
          actor_id: string | null;
          event_type: string;
          payload: Json;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          recipient_profile_id: string;
          kind: string;
          title: string;
          body: string;
          entity_type: string;
          entity_id: string | null;
          payload: Json;
          channel: "in_app";
          read_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: { read_at?: string | null };
        Relationships: [];
      };
    };
    Views: {
      contractor_public_profiles: {
        Row: {
          id: string;
          display_label: string;
          primary_trade: string | null;
          years_experience: number | null;
          short_description: string | null;
          about: string | null;
          accepting_work: boolean;
          created_at: string;
          service_area: string | null;
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
          sort_order: number;
          caption: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      contractor_public_reviews: {
        Row: {
          id: string;
          contractor_profile_id: string;
          rating: number;
          body: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      contractor_public_ratings: {
        Row: {
          contractor_profile_id: string;
          rating_average: number | null;
          rating_count: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      platform_reviews: {
        Row: {
          id: string;
          user_id: string;
          display_name: string;
          city: string | null;
          rating: number;
          body: string;
          status: import("../marketplace/platformReviews").PlatformReviewStatus;
          created_at: string;
        };
        Insert: {
          user_id?: string;
          display_name: string;
          city?: string | null;
          rating: number;
          body: string;
          status?: import("../marketplace/platformReviews").PlatformReviewStatus;
        };
        Update: {
          status?: import("../marketplace/platformReviews").PlatformReviewStatus;
        };
        Relationships: [];
      };
    };
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      current_fee_bps: { Args: Record<string, never>; Returns: number };
      fee_preview: { Args: { p_total_cents: number }; Returns: Json };
      preview_marketplace_fee: { Args: { p_amount_cents: number; p_kind?: string }; Returns: Json };
      compute_fee: { Args: { p_amount_cents: number; p_schedule_id: string }; Returns: Json };
      payments_live: { Args: Record<string, never>; Returns: boolean };
      charges_live: { Args: Record<string, never>; Returns: boolean };
      relationship_protection_months: { Args: Record<string, never>; Returns: number };
      expire_stale_pending_bookings: { Args: Record<string, never>; Returns: number };
      mark_booking_awaiting_payment: { Args: { p_booking_id: string }; Returns: Json };
      cancel_pending_booking: { Args: { p_booking_id: string }; Returns: Json };
      confirm_booking_for_testing: { Args: { p_booking_id: string }; Returns: Json };
      start_booking: { Args: { p_booking_id: string }; Returns: Json };
      complete_booking: { Args: { p_booking_id: string }; Returns: Json };
      dispute_booking: { Args: { p_booking_id: string }; Returns: Json };
      propose_change_order: {
        Args: { p_booking_id: string; p_description: string; p_amount_delta_cents: number };
        Returns: Json;
      };
      respond_change_order: { Args: { p_change_order_id: string; p_approve: boolean }; Returns: Json };
      submit_booking_review: {
        Args: { p_booking_id: string; p_rating: number; p_body?: string | null };
        Returns: Json;
      };
      confirm_booking_hired: { Args: { p_booking_id: string }; Returns: Json };
      booking_is_mutually_hired: { Args: { p_booking_id: string }; Returns: boolean };
      booking_job_contact: { Args: { p_booking_id: string }; Returns: Json };
      project_job_contact: { Args: { p_project_id: string }; Returns: Json };
      booking_has_contact_access: { Args: { p_booking_id: string }; Returns: boolean };
      contractor_has_contact_access_on_project: { Args: { p_project_id: string }; Returns: boolean };
      admin_grant_booking_contact_access: { Args: { p_booking_id: string; p_reason: string }; Returns: Json };
      admin_revoke_booking_contact_access: { Args: { p_booking_id: string; p_reason?: string | null }; Returns: Json };
      hire_again_contractors: { Args: Record<string, never>; Returns: Json };
      booking_is_confirmed_for_contractor: { Args: { p_project_id: string }; Returns: boolean };
      current_contractor_profile_id: { Args: Record<string, never>; Returns: string };
      post_project: { Args: { p_project_id: string }; Returns: Json };
      accept_opportunity: { Args: { p_opportunity_id: string }; Returns: Json };
      pass_opportunity: { Args: { p_opportunity_id: string }; Returns: Json };
      contractor_end_job: { Args: { p_opportunity_id: string }; Returns: Json };
      submit_estimate: { Args: { p_estimate_id: string }; Returns: Json };
      withdraw_estimate: { Args: { p_estimate_id: string }; Returns: Json };
      delete_estimate: { Args: { p_estimate_id: string }; Returns: Json };
      select_estimate: { Args: { p_project_id: string; p_estimate_id: string }; Returns: Json };
      mark_estimate_viewed: { Args: { p_estimate_id: string; p_project_id?: string | null }; Returns: Json };
      decline_estimate: { Args: { p_estimate_id: string }; Returns: Json };
      list_my_estimates: { Args: Record<string, never>; Returns: Json };
      list_my_notifications: { Args: Record<string, never>; Returns: Json };
      mark_notification_read: { Args: { p_notification_id: string }; Returns: Json };
      text_contains_contact_info: { Args: { p_text: string }; Returns: boolean };
      list_my_customer_projects: { Args: Record<string, never>; Returns: Json };
      get_my_customer_project: { Args: { p_project_id: string }; Returns: Json };
      update_customer_project: { Args: { p_project_id: string; p_patch: Json }; Returns: Json };
      cancel_customer_project: { Args: { p_project_id: string; p_confirm?: boolean }; Returns: Json };
      project_has_participation: { Args: { p_project_id: string }; Returns: boolean };
      contractor_can_read_project: { Args: { p_project_id: string }; Returns: boolean };
      list_contractor_approvals: { Args: { p_tab?: string }; Returns: Json };
      get_contractor_approval: { Args: { p_contractor_profile_id: string }; Returns: Json };
      count_pending_contractor_approvals: { Args: Record<string, never>; Returns: number };
      admin_approve_contractor: { Args: { p_contractor_profile_id: string }; Returns: Json };
      admin_reject_contractor: {
        Args: { p_contractor_profile_id: string; p_reason?: string | null };
        Returns: Json;
      };
      admin_request_contractor_info: {
        Args: { p_contractor_profile_id: string; p_message: string };
        Returns: Json;
      };
      list_public_directory_contractors: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          display_label: string;
          primary_trade: string | null;
          categories: string[] | null;
          service_area: string | null;
          years_experience: number | null;
          rating_average: number | null;
          rating_count: number;
          badges: Json;
          short_description: string | null;
        }[];
      };
      get_public_directory_contractor: {
        Args: { p_id: string };
        Returns: {
          id: string;
          display_label: string;
          primary_trade: string | null;
          categories: string[] | null;
          service_area: string | null;
          years_experience: number | null;
          rating_average: number | null;
          rating_count: number;
          badges: Json;
          short_description: string | null;
          about: string | null;
        }[];
      };
      list_public_directory_portfolio: {
        Args: { p_id: string };
        Returns: { id: string; caption: string; sort_order: number }[];
      };
      list_public_directory_reviews: {
        Args: { p_id: string };
        Returns: { id: string; rating: number; body: string }[];
      };
      text_contains_pre_hire_contact: { Args: { p_text?: string | null }; Returns: boolean };
      assert_no_pre_hire_contact: { Args: { p_text?: string | null }; Returns: undefined };
      connection_fee_cents: { Args: Record<string, never>; Returns: number };
      connection_has_contact_access: { Args: { p_connection_id: string }; Returns: boolean };
      project_connection_availability: { Args: { p_project_id: string }; Returns: Json };
      request_project_connection: {
        Args: { p_project_id: string; p_idempotency_key?: string | null };
        Returns: Json;
      };
      connection_fee_checkout_flags: { Args: Record<string, never>; Returns: Json };
      connection_fee_checkout_enabled: { Args: Record<string, never>; Returns: boolean };
      signup_fee_checkout_flags: { Args: Record<string, never>; Returns: Json };
      signup_fee_enabled: { Args: Record<string, never>; Returns: boolean };
      signup_fee_state_for_me: { Args: Record<string, never>; Returns: Json };
      signup_fee_is_satisfied: { Args: { p_profile_id: string }; Returns: boolean };
      stop_new_project_connections: { Args: { p_project_id: string }; Returns: Json };
      list_my_project_connections: { Args: { p_project_id?: string | null }; Returns: Json };
      submit_content_report: {
        Args: { p_target_type: string; p_target_id?: string | null; p_reason: string; p_notes?: string | null };
        Returns: Json;
      };
      admin_grant_connection_contact_access: {
        Args: { p_connection_id: string; p_reason: string };
        Returns: Json;
      };
      admin_revoke_connection_contact_access: {
        Args: { p_connection_id: string; p_reason?: string | null };
        Returns: Json;
      };
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
      booking_status: import("../marketplace/types").BookingStatus;
      contact_access_status: import("../marketplace/types").ContactAccessStatus;
      contact_grant_source: import("../marketplace/types").ContactGrantSource;
      fee_schedule_kind: import("../marketplace/types").FeeScheduleKind;
      relationship_status: import("../marketplace/types").RelationshipStatus;
      change_order_status: import("../marketplace/types").ChangeOrderStatus;
      project_connection_status: import("../marketplace/types").ProjectConnectionStatus;
      signup_fee_status: import("../signupFee/constants").SignupFeeStatus;
      platform_review_status: import("../marketplace/platformReviews").PlatformReviewStatus;
    };
  };
};
