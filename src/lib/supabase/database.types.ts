import type {
  AccountStatus,
  AccountType,
  ApprovalStatus,
  OnboardingStatus,
} from "../auth/types";

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
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: {
      account_type: AccountType;
      account_status: AccountStatus;
      onboarding_status: OnboardingStatus;
      approval_status: ApprovalStatus;
    };
  };
};
