export type PortfolioReviewItem = {
  id: string;
  contractor_profile_id: string;
  contractor_label: string;
  title: string;
  description: string | null;
  storage_path: string;
  created_at: string;
};

export type PortfolioPrivacyChoice = "PUBLIC_SAFE" | "PRIVATE";
