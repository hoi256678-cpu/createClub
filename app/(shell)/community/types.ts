export type CommunityPost = {
  id: string;
  tag: string;
  title: string;
  body: string;
  image: string | null;
  isMine: boolean;
  authorName: string;
  authorRole: string;
  createdAt: string;
  updatedAt: string;
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
