export type CommunityPost = {
  id: string;
  tag: string;
  title: string;
  body: string;
  image: string | null;
  isMine: boolean;
  isNotice: boolean;
  pinned: boolean;
  authorName: string;
  authorRole: string;
  createdAt: string;
  editedAt: string | null;
  views: number;
  likeCount: number;
  cmtCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
};

export type CommunityComment = {
  id: string;
  authorName: string;
  authorRole: string;
  text: string;
  createdAt: string;
};

export type CommunityPostDetail = CommunityPost & {
  comments: CommunityComment[];
};

export type NoticeItem = { id: string; title: string; body: string; pinned: boolean; createdAt: string };
