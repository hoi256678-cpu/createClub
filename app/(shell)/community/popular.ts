import type { CommunityPost } from "./types";

export function pickPopularPosts(posts: CommunityPost[]): CommunityPost[] {
  return [...posts]
    .filter((p) => p.likeCount > 0)
    .sort((a, b) => b.likeCount - a.likeCount)
    .slice(0, 5);
}
