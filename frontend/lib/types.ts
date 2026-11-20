export type Book = {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  isbn: string | null;
  language: string;
  publication_date: string | null;
  edition: string;
  page_count: number | null;
  authors: number[];
  authors_display: string[];
  publisher: number | null;
  publisher_name: string | null;
  category: number | null;
  category_name: string | null;
  tags: string[];
  visibility: "public" | "private";
  status: "draft" | "published";
  is_featured: boolean;
  is_premium: boolean;
  document_available: boolean;
  cover_available: boolean;
  created_by: number | null;
  created_at: string;
}

export type DownloadStatsDay = { day: string; count: number };

export type BookDownloadStat = {
  id: number;
  title: string;
  authors: string[];
  category_name: string | null;
  is_premium: boolean;
  downloads: number;
  unique_users: number;
  last_download_at: string | null;
  rank: number;
};

export type UserDownloadStat = {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  total_events: number;
  unique_books: number;
  most_recent_book: string | null;
  last_download_at: string | null;
  date_joined: string;
};

export type RecentDownloadActivity = {
  id: number;
  user_id: number;
  username: string;
  book_id: number;
  book_title: string;
  downloaded_at: string;
};

export type AdminDownloadOverview = {
  total_download_events: number;
  total_downloaded_books: number;
  total_downloading_users: number;
  total_download_events_recorded: number;
  most_downloaded: BookDownloadStat[];
  least_downloaded: BookDownloadStat[];
  recent_activity: RecentDownloadActivity[];
  downloads_by_day: DownloadStatsDay[];
};

export type UserDownloadHistoryItem = {
  id: number;
  book: number;
  book_title: string;
  book_author: string[];
  is_premium: boolean;
  downloaded_at: string;
  times_downloaded: number;
};

export type MyDownloadStats = {
  total_events: number;
  unique_books: number;
  recent: UserDownloadHistoryItem[];
  downloads_by_day: DownloadStatsDay[];
};

export type Download = {
  id: number;
  book: number;
  book_title: string;
  book_author: string[];
  is_premium: boolean;
  book_type: string;
  cover_url: string | null;
  downloaded_at: string;
  times_downloaded: number;
};

export type ReadingActivitySeriesPoint = {
  bucket: string;
  sessions: number;
  active_readers: number;
  read_seconds: number;
};

export type ReadingTopReader = {
  id: number;
  username: string;
  full_name: string;
  sessions: number;
  books: number;
  read_seconds: number;
  days_active: number;
  last_activity: string | null;
  engagement: "high" | "medium" | "low";
};

export type ReadingTopCategory = {
  category: string | null;
  sessions: number;
  active_readers: number;
  read_seconds: number;
  percent: number;
};

export type ReadingRecentSession = {
  id: number;
  username?: string;
  book_title: string;
  started_at: string;
  duration_seconds: number;
};

export type ReadingActivityOverview = {
  period: "7d" | "30d" | "6m";
  granularity: "day" | "month";
  range_start: string;
  range_end: string;
  totals: {
    sessions: number;
    active_readers: number;
    read_seconds: number;
    books_opened: number;
    avg_session_seconds: number;
    new_readers: number;
    returning_readers: number;
    declining_readers: number;
    engagement_trend_pct: number | null;
    prev_read_seconds: number;
  };
  insights: {
    most_active_weekday: number | null;
    peak_period: "night" | "morning" | "afternoon" | "evening" | null;
    most_popular_category: string | null;
    overall_trend: "up" | "down" | "flat" | null;
  };
  series: ReadingActivitySeriesPoint[];
  top_readers: ReadingTopReader[];
  top_categories: ReadingTopCategory[];
  recent_sessions: ReadingRecentSession[];
};

export type ReadingUserDetail = {
  period: "7d" | "30d" | "6m";
  granularity: "day" | "month";
  user: {
    id: number;
    username: string;
    full_name: string;
    role: string;
    date_joined: string;
  };
  totals: {
    sessions: number;
    books_opened: number;
    read_seconds: number;
    avg_session_seconds: number;
    days_active: number;
    last_activity: string | null;
    engagement_trend_pct: number | null;
  };
  series: ReadingActivitySeriesPoint[];
  recent_sessions: ReadingRecentSession[];
  top_categories: ReadingTopCategory[];
};

export type MyReadingStatsPoint = { bucket: string; sessions: number; read_seconds: number };

export type MyReadingBook = {
  id: number;
  title: string;
  authors: string[];
  cover_url: string | null;
  read_seconds: number;
  sessions: number;
  progress_percentage: number | null;
  last_read_at: string | null;
  completed: boolean;
};

export type MyReadingRecentItem = {
  id: number;
  book: number;
  book_title: string;
  authors: string[];
  cover_url: string | null;
  started_at: string;
  duration_seconds: number;
  progress_percentage: number | null;
};

export type MyReadingStats = {
  period: "7d" | "30d" | "6m";
  granularity: "day" | "month";
  range_start: string;
  range_end: string;
  totals: {
    read_seconds: number;
    sessions: number;
    days_active: number;
    books_opened: number;
    avg_session_seconds: number;
    avg_daily_seconds: number;
    avg_monthly_seconds: number | null;
    engagement_trend_pct: number | null;
  };
  lifetime: {
    books_read: number;
    books_in_progress: number;
    read_seconds: number;
    sessions: number;
    days_active: number;
  };
  insights: {
    favorite_category: string | null;
    most_active_weekday: number | null;
    most_frequent_book: { id: number; title: string; sessions: number } | null;
    consistency_pct: number;
    trend: "up" | "down" | "flat" | null;
    total_sessions: number;
    completed_books: number;
  };
  series: MyReadingStatsPoint[];
  most_read: MyReadingBook[];
  recent: MyReadingRecentItem[];
};

export type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export type Dashboard = {
  role: string;
  total_users?: number;
  total_books?: number;
  published_books?: number;
  draft_books?: number;
  total_readers?: number;
  total_reading_activity?: number;
  can_manage_catalog?: boolean;
  total_downloads?: number;
  active_subscriptions?: number;
  books_in_progress?: number;
  bookmarks?: number;
  notes?: number;
  continue_reading?: { book_id: number; title: string; page: number; percentage: number; last_read_at: string }[];
  recent_books?: { id: number; title: string; created_at: string }[];
  recent_activity?: {
    user__username: string;
    book__id: number;
    book__title: string;
    current_page: number;
    last_read_at: string;
  }[];
  subscription?: { plan: string; status: string; starts_at: string; expires_at: string | null } | null;
}
