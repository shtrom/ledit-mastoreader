import { Comment, ContentDom, Post, Posts, SortingOption, Source, SourcePrefix } from "./data";
import { RedditSource } from "./reddit";
import { getSettings } from "./settings";
import { svgCircle, svgDownArrow, svgReblog, svgStar, svgUpArrow } from "./svg";
import { addCommasToNumber, dom, proxyFetch, renderGallery, renderVideo } from "./utils";

const mastodonUserIds = localStorage.getItem("mastodonCache") ? JSON.parse(localStorage.getItem("mastodonCache")!) : {};

interface MastodonAccount {
   acct: string;
   avatar: string | null;
   avatar_static: string | null;
   bot: boolean;
   created_at: string;
   discoverable: boolean;
   display_name: string | null;
   followers_count: number;
   following_count: number;
   header: string | null;
   header_static: string | null;
   id: string;
   last_status_at: string;
   locked: boolean;
   noindex: boolean;
   note: string | null;
   statuses_count: number;
   url: string;
   username: string;
}

interface MastodonMention {
   acct: string;
   id: string;
   url: string;
   username: string;
}

interface MastodonMedia {
   id: string;
   type: "image" | "gifv" | "video" | "audio";
   url: string;
   meta: {
      original:
         | {
              width: number;
              height: number;
              aspect: number;
           }
         | undefined;
   };
}

interface MastodonCard {}

interface MastodonPoll {
   options: {title: string, votes_count: number }[];
   voters_count: number;
   votes_count: number;
}

interface MastodonPost {
   account: MastodonAccount;
   content: string;
   card: MastodonCard;
   created_at: string;
   edited_at: string | null;
   favourites_count: number;
   id: string;
   in_reply_to_account_id: string | null;
   in_reply_to_id: string | null;
   media_attachments: MastodonMedia[];
   metions: MastodonMention;
   poll: MastodonPoll;
   reblog: MastodonPost | null;
   reblogs_count: number;
   replies_count: number;
   sensitive: boolean;
   spoiler_text: string;
   uri: string;
   url: string;
   visibility: string;
}

function extractUserHostAndBearer(input: string): { username: string; host: string; bearer: string | null } | null {
   let username = "";
   let host = "";
   let bearer: string | null = null;

   if (input.startsWith("https://")) {
      const url = new URL(input);
      if (url.pathname.startsWith("/users/")) {
         const userPart = url.pathname.substring("/users/".length);
         const userHostParts = url.host.split(".");
         if (userHostParts.length >= 2) {
            username = userPart;
            host = userHostParts.slice(-2).join(".");
         }
      }
   } else {
      if (input.startsWith("@")) input = input.substring(1);
      const tokens = input.split("@");
      if (tokens.length != 2) {
         return null;
      }
      username = tokens[0];
      host = tokens[1];
      const bearerIndex = host.indexOf(":");
      if (bearerIndex != -1) {
         bearer = host.substring(bearerIndex + 1);
         host = host.substring(0, bearerIndex);
      }
   }

   return { username, host, bearer };
}

type MastodonUserInfo = { username: string; host: string; bearer: string | null };

export class MastodonSource implements Source {
   static localizeMastodonPostIds(mastodonPost: MastodonPost, userInfo: MastodonUserInfo) {
      if (!userInfo.bearer) return;
      mastodonPost.url = `https://${userInfo.host}/@${mastodonPost.account.username}@${new URL(mastodonPost.account.url).host}/${mastodonPost.id}`;
      mastodonPost.account.url = `https://${userInfo.host}/@${mastodonPost.account.username}@${new URL(mastodonPost.account.url).host}/`;
      if (mastodonPost.reblog) {
         mastodonPost.reblog.url = `https://${userInfo.host}/@${mastodonPost.reblog.account.username}@${
            new URL(mastodonPost.reblog.account.url).host
         }/${mastodonPost.reblog.id}`;
         mastodonPost.reblog.account.url = `https://${userInfo.host}/@${mastodonPost.reblog.account.username}@${
            new URL(mastodonPost.reblog.account.url).host
         }/`;
      }
   }

   static async getMastodonUserPosts(mastodonUser: string, after: string | null): Promise<Post[]> {
      if (after == "end") return [];
      const originalMastodonUser = mastodonUser;
      let mastodonUserId: string | null = mastodonUserIds[mastodonUser];

      const userInfo = extractUserHostAndBearer(mastodonUser);
      if (!userInfo) return [];

      if (!mastodonUserId) {
         const url = "https://" + userInfo.host + "/api/v1/accounts/lookup?acct=" + userInfo.username;
         const response = await fetch(url);
         const json = await response.json();
         if (!json.id) return [];
         mastodonUserId = json.id;
         mastodonUserIds[originalMastodonUser] = mastodonUserId;
         localStorage.setItem("mastodonCache", JSON.stringify(mastodonUserIds));
      }

      const response = !userInfo.bearer
         ? await fetch(`https://${userInfo.host}/api/v1/accounts/${mastodonUserId}/statuses?limit=40`)
         : await fetch(`https://${userInfo.host}/api/v1/timelines/home?limit=40${after ? `&max_id=${after}` : ""}`, {
              method: "GET",
              headers: {
                 Authorization: "Bearer " + userInfo.bearer,
              },
           });
      const json = await response.json();
      const mastodonPosts = json as MastodonPost[];
      const posts: Post[] = [];
      const onlyShowRoots = getSettings().showOnlyMastodonRoots;
      for (const mastodonPost of mastodonPosts) {
         this.localizeMastodonPostIds(mastodonPost, userInfo);
         let postToView = mastodonPost.reblog ?? mastodonPost;
         if (onlyShowRoots && postToView.in_reply_to_account_id) continue;
         const avatarImageUrl = postToView.account.avatar_static;
         let postUrl = postToView.url;
         let authorUrl = postToView.account.url;

         const post = {
            url: postUrl,
            domain: postToView.account.username + "@" + new URL(postToView.uri).host,
            feed: `${
               avatarImageUrl
                  ? `<img src="${avatarImageUrl}" style="border-radius: 4px; max-height: calc(2.5 * var(--ledit-font-size));">`
                  : userInfo.username + "@" + userInfo.host
            }`,
            title: "",
            isSelf: false,
            author: postToView.account.display_name,
            authorUrl: authorUrl,
            createdAt: new Date(postToView.created_at).getTime() / 1000,
            score: postToView.favourites_count,
            numComments: postToView.replies_count,
            mastodonPost,
            userInfo,
         } as Post;
         posts.push(post);
      }
      return posts;
   }

   async getPosts(after: string | null): Promise<Posts> {
      const urls = this.getFeed().split("+");
      let afters: (string | null)[] | undefined = after?.split("+");
      const promises: Promise<Post[]>[] = [];
      for (let i = 0; i < urls.length; i++) {
         promises.push(MastodonSource.getMastodonUserPosts(urls[i], afters ? afters[i] : null));
      }

      const promisesResult = await Promise.all(promises);
      const posts: Post[] = [];
      const newAfters = [];
      for (let i = 0; i < urls.length; i++) {
         posts.push(...promisesResult[i]);
         const userInfo = extractUserHostAndBearer(urls[i]);
         if (!userInfo) {
            newAfters.push(null);
            continue;
         }

         if (userInfo?.bearer) {
            let maxId =
               promisesResult[i].length == 0 ? null : ((promisesResult[i][promisesResult[i].length - 1] as any).mastodonPost as MastodonPost).id;
            newAfters.push(maxId);
         } else {
            // v1/accounts/<userid>/statuses only returns up to 40 posts max.
            newAfters.push("end");
         }
      }
      return { posts, after: newAfters!.join("+") };
   }

   async getComments(post: Post): Promise<Comment[]> {
      const mastodonPost = (post as any).mastodonPost as MastodonPost;
      const userInfo = (post as any).userInfo as MastodonUserInfo;
      let postToView = mastodonPost.reblog ?? mastodonPost;
      let host = new URL(postToView.uri).host;
      let statusId = postToView.uri.split("/").pop();
      if (userInfo.bearer) {
         host = userInfo.host
         statusId = postToView.id;
      }
      const response = await fetch(`https://${host}/api/v1/statuses/${statusId}/context`);
      const context = (await response.json()) as { descendants: MastodonPost[] };

      const roots: Comment[] = [];
      const comments: Comment[] = [];
      const commentsById = new Map<string, Comment>();
      for (const reply of context.descendants) {
         MastodonSource.localizeMastodonPostIds(reply, userInfo);
         let replyUrl = reply.url;
         const avatarImageUrl = reply.account.avatar_static;
         const content = this.getContent(reply);
         const comment = {
            url: replyUrl,
            author: avatarImageUrl ? /*html*/`
               <img src="${avatarImageUrl}" style="border-radius: 4px; max-height: calc(1 * var(--ledit-font-size));">
               <span>${reply.account.display_name}</span>
            `
            : reply.account.display_name!,
            authorUrl: reply.account.url,
            createdAt: new Date(reply.created_at).getTime() / 1000,
            score: null,
            content,
            replies: [],
            mastodonComment: reply,
         } as Comment;
         if (reply.in_reply_to_id == statusId) roots.push(comment);
         comments.push(comment);
         commentsById.set(reply.id, comment);
      }
      for (const comment of comments) {
         const mastodonComment = (comment as any).mastodonComment as MastodonPost;
         if (mastodonComment.in_reply_to_id == statusId) continue;
         if (commentsById.get(mastodonComment.in_reply_to_id!)) {
            const other = commentsById.get(mastodonComment.in_reply_to_id!)!;
            other.replies.push(comment);
         }
      }
      return roots;
   }

   getContentDom(post: Post): ContentDom {
      let mastodonPost = (post as any).mastodonPost as MastodonPost;
      return this.getContent(mastodonPost);
   }

   getContent(mastodonPost: MastodonPost): ContentDom {
      let postToView = mastodonPost.reblog ?? mastodonPost;
      const toggles: Element[] = [];

      const points = dom( /*html*/`
      <div class="post-points">
         <span class="svgIcon color-fill">${svgReblog}</span>
         <span>${addCommasToNumber(postToView.reblogs_count)}</span>
         <span class="svgIcon color-fill">${svgStar}</span>
         <span>${addCommasToNumber(postToView.favourites_count)}</span>
      </div>
      `)[0];
      toggles.push(points);

      let prelude = "";
      if (mastodonPost.reblog) {
         const avatarImageUrl = mastodonPost.account.avatar_static;
         prelude = /*html*/ `
         <a href="${mastodonPost.account.url}" target="_blank" style="color: var(--ledit-color-dim);">
            <div class="post-mastodon-prelude">
                  <span>Boosted by</span>
                  <img src="${avatarImageUrl}" style="border-radius: 4px; max-height: calc(1.5 * var(--ledit-font-size));">
                  <span>${mastodonPost.account.display_name}</span>
            </div>
         </a>
         `;
      }
      const content = dom(`<div class="post-content">${prelude}${postToView.content}</div>`)[0];


      if (postToView.poll) {
         const pollDiv = dom(`<div class="post-mastodon-poll"></div>`)[0];
         for (const option of postToView.poll.options) {
            pollDiv.append(dom(`<div class="post-mastodon-poll-option svgIcon color-fill">${svgCircle}${option.title}</div>`)[0]);
         }
         pollDiv.append(dom(`<div class="post-mastodon-poll-summary">${postToView.poll.votes_count} votes, ${postToView.poll.voters_count} voters</div>`)[0]);
         content.append(pollDiv);
      }

      if (postToView.media_attachments.length > 0) {
         const images: string[] = [];
         const videos: MastodonMedia[] = [];

         for (const media of postToView.media_attachments) {
            if (media.type == "image") {
               images.push(media.url);
            } else if (media.type == "gifv") {
               videos.push(media);
            } else if (media.type == "video") {
               videos.push(media);
            }
         }

         if (images.length >= 1) {
            const gallery = renderGallery(images)
            content.append(gallery.gallery);
            if (images.length > 1) toggles.push(gallery.toggle);
         }
         if (videos.length >= 1) {
            for (const video of videos) {
               content.append(
                  renderVideo(
                     {
                        width: video.meta.original?.width ?? 0,
                        height: video.meta.original?.height ?? 0,
                        dash_url: null,
                        hls_url: null,
                        fallback_url: video.url,
                     },
                     false
                  )
               );
            }
         }
      }

      if (postToView.card) {
         // FIXME render cards
      }

      return {elements: [content], toggles};
   }

   getFeed(): string {
      const hash = window.location.hash;
      if (hash.length == 0) {
         return "";
      }
      let slashIndex = hash.indexOf("/");
      if (slashIndex == -1) return "";
      return decodeURIComponent(hash.substring(slashIndex + 1));
   }

   getSourcePrefix(): SourcePrefix {
      return "m/";
   }
   getSortingOptions(): SortingOption[] {
      return [];
   }
   getSorting(): string {
      return "";
   }
}
