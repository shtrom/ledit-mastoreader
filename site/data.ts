import { assertNever } from "./utils";

export interface Posts {
   posts: Post[];
   after: string | null;
}

export interface Post {
   url: string;
   title: string;
   isSelf: boolean;
   isGallery: boolean;
   numGalleryImages: number;
   author: string;
   authorUrl: string;
   createdAt: number;
   feed: string;
   score: number;
   numComments: number;
}

export interface Comment {
   url: string;
   author: string;
   authorUrl: string;
   createdAt: number;
   score: number;
   html: string | Element[];
   replies: Comment[];
}

export interface SortingOption {
   value: string;
   label: string;
}

export interface Source {
   getPosts(after: string | null): Promise<Posts>,
   getComments(post: Post): Promise<Comment[]>,
   getMediaDom(post: Post): Element[],
   getFeed(): string,
   getSourcePrefix(): SourcePrefix,
   getSortingOptions(): SortingOption[],
   getSorting(): string,
}

let source: Source | null = null;

export function setSource(src: Source) {
   source = src;
}

export function getSource(): Source {
   if (!source) throw new Error("No source given.");
   return source;
}

export type SourcePrefix = "r/" | "hn/" | "rss/" | "yt/" | "m/";
export function sourcePrefixLabel(source: SourcePrefix) {
   switch(source) {
      case "r/": return "Reddit";
      case "hn/": return "Hackernews"
      case "rss/": return "RSS"
      case "yt/": return "YouTube"
      case "m/": return "Mastodon"
      default:
         assertNever(source);
   }
}
