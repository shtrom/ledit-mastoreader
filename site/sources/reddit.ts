import "video.js/dist/video-js.min.css";

import { Page, PageIdentifier, SortingOption, Source, SourcePrefix } from "./data";
import { addCommasToNumber, dateToText, elements, htmlDecode, intersectsViewport, onVisibleOnce, setLinkTargetsToBlank } from "../utils";
import {
   dom,
   renderGallery,
   renderVideo,
   makeCollapsible,
   safeHTML,
   renderContentLoader,
   renderOverlay,
   renderErrorMessage,
   renderInfoMessage,
} from "./utils";
// @ts-ignore
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
// @ts-ignore
import { TemplateResult, html } from "lit-html";
// @ts-ignore
import commentIcon from "remixicon/icons/Communication/chat-4-line.svg";
// @ts-ignore
import replyIcon from "remixicon/icons/Business/reply-line.svg";
// @ts-ignore
import imageIcon from "remixicon/icons/Media/image-line.svg";
import { renderComments } from "./comments";
// @ts-ignore
import { map } from "lit-html/directives/map.js";

interface RedditPosts {
   kind: "listing";
   data: {
      after: string;
      children: RedditPost[];
   };
}

interface RedditPost {
   data: {
      author: string;
      created_utc: number;
      domain: string;
      is_created_from_ads_ui: boolean;
      is_reddit_media_domain: boolean;
      is_video: boolean;
      is_self: boolean;
      is_gallery: boolean;
      id: string;
      num_comments: number;
      over_18: boolean;
      permalink: string;
      selftext_html: string;
      gallery_data: {
         items: { media_id: string; id: number }[];
      };
      media_metadata: {
         [key: string]: {
            status: string;
            p: {
               x: number;
               y: number;
               u: string;
            }[];
         };
      };
      preview: {
         enabled: boolean;
         images: {
            resolutions: {
               url: string;
               width: number;
               height: number;
            }[];
         }[];
         reddit_video_preview: {
            dash_url: string;
            hls_url: string;
            fallback_url: string;
            is_gif: boolean;
            width: number;
            height: number;
         } | null;
         source: {
            url: string;
            width: number;
            height: number;
         };
      };
      secure_media: {
         reddit_video: {
            fallback_url: string;
            width: number;
            height: number;
            dash_url: string;
            hls_url: string;
         };
      };
      secure_media_embed: {
         content: string;
         width: number;
         height: number;
         media_domain_url: string;
      };
      score: number;
      subreddit: string;
      subreddit_id: string;
      thumbnail: string;
      title: string;
      ups: number;
      downs: number;
      url: string;
   };
}

export interface RedditComment {
   data: {
      author: string;
      created_utc: number;
      body_html: string;
      score: number;
      permalink: string;
      replies: RedditComments | "" | undefined;
   };
   kind: "t1" | "more";
}

export interface RedditComments {
   data: {
      children: RedditComment[];
   };
   kind: "Listing";
}

function getSubreddit(hash: string) {
   if (hash.length == 0) {
      return "all";
   }
   const tokens = hash.substring(1).split("/");
   if (tokens.length < 2) return "all";
   return decodeURIComponent(tokens[1]);
}

export class RedditSource extends Source<RedditPost> {
   constructor(feed: string) {
      super(feed);

      window.addEventListener("hashchange", async () => {
         const hash = window.location.hash;
         // FIXME show error if the hash can't be parsed
         if (!hash.startsWith("#r/")) return;
         const tokens = hash.split("/");
         if (tokens.length < 4) return;
         if (tokens[2] != "comments") return;
         await renderRedditComments(this, hash.substring(1));
      });
   }

   async getPosts(nextPage: PageIdentifier): Promise<Page<RedditPost> | Error> {
      try {
         const sortFrag = this.getSortingFragment();
         const sortParam = this.getSortingParameter();
         const hash = "/r/" + this.getSubreddit() + "/" + sortFrag + "/.json?" + sortParam + "&" + (nextPage ? "after=" + nextPage : "");
         const url = "https://www.reddit.com" + (!hash.startsWith("/") ? "/" : "") + hash;
         const response = await fetch(url);
         const redditPosts = (await response.json()) as RedditPosts;
         if (!redditPosts || !redditPosts.data || !redditPosts.data.children) {
            return new Error(`Could not load posts for subreddit ${this.getSubreddit()}`);
         }

         const posts: RedditPost[] = [];
         for (const redditPost of redditPosts.data.children) {
            if (redditPost.data.author == undefined) continue;
            posts.push(redditPost);
         }

         return {
            items: posts,
            nextPage: redditPosts.data.after,
         };
      } catch (e) {
         return new Error(`Could not load subreddit 'r/${this.getSubreddit()}'. It may not exist.`);
      }
   }
   async getComments(permalink: string): Promise<{ post: RedditPost; comments: RedditComment[] } | Error> {
      try {
         const commentsUrl = "https://www.reddit.com/" + permalink + ".json?limit=15000";
         const response = await fetch(commentsUrl);
         const data = await response.json();
         if (data.length < 2) return new Error("Could not load comments for " + permalink);
         if (!data[0] || !data[0].data || !data[0].data.children || !data[0].data.children[0])
            return new Error("Could not load comments for " + permalink);
         const post = data[0].data.children[0] as RedditPost;
         const redditComments = data[1] as RedditComments;
         if (!redditComments || !redditComments.data || !redditComments.data.children) {
            return new Error(`Could not load comments.`);
         }

         const comments: RedditComment[] = [];
         for (const comment of redditComments.data.children) {
            if (comment.data.author == undefined) {
               continue;
            }
            comments.push(comment);
         }
         return { post, comments };
      } catch (e) {
         throw new Error("Network error.");
      }
   }

   getSubreddit() {
      return getSubreddit(this.feed);
   }

   getFeed() {
      return this.getSubreddit();
   }

   getSourcePrefix(): SourcePrefix {
      return "r/";
   }

   getSortingOptions(): SortingOption[] {
      return [
         { value: "hot", label: "Hot" },
         { value: "new", label: "New" },
         { value: "rising", label: "Rising" },
         { value: "top-today", label: "Top today" },
         { value: "top-week", label: "Top week" },
         { value: "top-month", label: "Top month" },
         { value: "top-year", label: "Top year" },
         { value: "top-alltime", label: "Top all time" },
      ];
   }

   getSorting() {
      const hash = this.feed;
      if (hash.length == 0) {
         return "hot";
      }
      const tokens = hash.substring(1).split("/");
      if (tokens.length < 3) return "hot";
      if (["hot", "new", "rising", "top-today", "top-week", "top-month", "top-year", "top-alltime"].some((sorting) => sorting == tokens[2])) {
         return tokens[2];
      } else {
         return "hot";
      }
   }

   getSortingFragment() {
      return this.getSorting().split("-")[0];
   }

   getSortingParameter() {
      const tokens = this.getSorting().split("-");
      if (tokens.length != 2) return "";
      return "t=" + tokens[1];
   }
}

function renderRedditMedia(canonicalPost: RedditPost, container: HTMLElement): HTMLElement[] {
   const post = canonicalPost.data;
   const computed = getComputedStyle(container);
   const postsWidth = Number.parseInt(computed.width) - Number.parseFloat(computed.paddingLeft) - Number.parseFloat(computed.paddingRight);
   // Self post, show text, dim it, cap vertical size, and make it expand on click.
   if (post.is_self) {
      let selfPost = dom(html`<div class="content-text">${safeHTML(htmlDecode(post.selftext_html ?? ""))}</div>`)[0];

      requestAnimationFrame(() => {
         makeCollapsible(selfPost, 10);
      });
      return [selfPost];
   }

   // Gallery
   if (post.is_gallery && post.media_metadata && post.gallery_data) {
      type image = { x: number; y: number; u: string };
      const images: image[] = [];
      for (const imageKey of post.gallery_data.items) {
         if (post.media_metadata[imageKey.media_id].p) {
            let image: image | null = null;
            for (const img of post.media_metadata[imageKey.media_id].p) {
               image = img;
               if (img.x > postsWidth) break;
            }
            if (image) images.push(image);
         }
      }
      const imageUrls = images.map((img) => htmlDecode(img.u)!);
      const gallery = renderGallery(imageUrls);
      return [gallery];
   }

   // Reddit hosted video
   if (post.secure_media && post.secure_media.reddit_video) {
      const embed = { width: post.secure_media.reddit_video.width, height: post.secure_media.reddit_video.height, urls: [] as string[] };
      if (post.secure_media.reddit_video.dash_url) embed.urls.push(htmlDecode(post.secure_media.reddit_video.dash_url)!);
      if (post.secure_media.reddit_video.hls_url) embed.urls.push(htmlDecode(post.secure_media.reddit_video.hls_url)!);
      if (post.secure_media.reddit_video.fallback_url) embed.urls.push(htmlDecode(post.secure_media.reddit_video.fallback_url)!);
      return [renderVideo(embed, false)];
   }

   // External embed like YouTube Vimeo
   if (post.secure_media_embed && post.secure_media_embed.media_domain_url) {
      const embed = post.secure_media_embed;
      const embedWidth = postsWidth;
      const embedHeight = Math.floor((embed.height / embed.width) * embedWidth);
      if (embed.content.includes("iframe")) {
         const embedUrl = htmlDecode(
            embed.content
               .replace(`width="${embed.width}"`, `width="${embedWidth}"`)
               .replace(`height="${embed.height}"`, `height="${embedHeight}"`)
               .replace("position:absolute;", "")
         );
         let embedDom = dom(html`<div width="${embedWidth}" height="${embedHeight}">${htmlDecode(embedUrl!)}</div>`)[0];
         // Make YouTube videos stop if they scroll out of frame.
         if (embed.content.includes("youtube")) {
            // Pause when out of view
            document.addEventListener("scroll", () => {
               const videoElement = embedDom.querySelector("iframe");
               if (videoElement && !intersectsViewport(videoElement)) {
                  videoElement.contentWindow?.postMessage('{"event":"command","func":"' + "pauseVideo" + '","args":""}', "*");
               }
            });
            return [embedDom];
         }
      } else {
         return dom(
            html`<div width="${embedWidth}" height="${embedHeight}">
               <iframe width="${embedWidth}" height="${embedHeight}" src="${htmlDecode(embed.media_domain_url)}"></iframe>
            </div>`
         );
      }
   }

   // Plain old .gif
   if (post.url.endsWith(".gif")) {
      return dom(html`<img src="${htmlDecode(post.url)}" />`);
   }

   // Image, pick the one that's one size above the current posts width so pinch zooming
   // in shows more pixels.
   if (post.preview && post.preview.images && post.preview.images.length > 0) {
      let image: { url: string; width: number; height: number } | null = null;
      for (const img of post.preview.images[0].resolutions) {
         image = img;
         if (img.width >= postsWidth) break;
      }
      if (!image) return [document.createElement("div")];
      if (!post.preview.reddit_video_preview?.fallback_url) return dom(html`<img src="${htmlDecode(image.url)}" />`);
      const video = { width: post.preview.reddit_video_preview.width, height: post.preview.reddit_video_preview.height, urls: [] as string[] };
      if (post.preview.reddit_video_preview.dash_url) video.urls.push(htmlDecode(post.preview.reddit_video_preview.dash_url)!);
      if (post.preview.reddit_video_preview.hls_url) video.urls.push(htmlDecode(post.preview.reddit_video_preview.hls_url)!);
      if (post.preview.reddit_video_preview.fallback_url) video.urls.push(htmlDecode(post.preview.reddit_video_preview.fallback_url)!);
      return [renderVideo(video, post.preview.reddit_video_preview.is_gif)];
   }

   // Fallback to thumbnail which is super low-res.
   const missingThumbnailTags = new Set<String>(["self", "nsfw", "default", "image", "spoiler"]);
   const thumbnailUrl = post.thumbnail.includes("://") ? post.thumbnail : "";
   if (post.thumbnail && !missingThumbnailTags.has(post.thumbnail)) {
      return dom(html`<img src="${htmlDecode(thumbnailUrl)}" />`);
   }
   return [];
}

export function renderRedditPost(post: RedditPost, showActionButtons = true): HTMLElement[] {
   const url = post.data.url.startsWith("/r/") ? "https://www.reddit.com" + post.data.url : post.data.url;
   const authorUrl = "https://www.reddit.com/u/" + post.data.author;
   const date = dateToText(post.data.created_utc * 1000);
   const subReddit =
      post.data.subreddit.toLowerCase() != getSubreddit(location.hash)
         ? html`<a href="https://www.reddit.com/${post.data.subreddit}" class="text-color/50">r/${post.data.subreddit}</a>`
         : null;

   // FIXME Show points
   const postDom = dom(html`
      <article class="post reddit-post gap-1">
         <a href="${url}" class="font-bold text-lg text-color">${htmlDecode(post.data.title)}</a>
         <div class="flex gap-1 text-xs">
            <span class="flex items-center text-color/50">${addCommasToNumber(post.data.score)} pts</span>
            <span class="flex items-center text-color/50">•</span>
            ${subReddit
               ? html`
                    <a href="${authorUrl}" class="text-color/50">${subReddit}</a>
                    <span class="flex items-center text-color/50">•</span>
                 `
               : ""}
            <a href="${authorUrl}" class="text-color/50">${post.data.author}</a>
            <span class="flex items-center text-color/50">•</span>
            <span class="flex items-center text-color/50">${date}</span>
         </div>
         <section x-id="contentDom" class="content mt-2"></section>
         ${showActionButtons
            ? html`
                 <div class="flex items-flex-start gap-4">
                    <a href="${`#${post.data.permalink.substring(1)}`}" class="self-link flex items-center gap-1 h-[2em]">
                       <i class="icon">${unsafeHTML(commentIcon)}</i>
                       <span class="text-primary">${addCommasToNumber(post.data.num_comments)}</span>
                    </span>
                    <a href="${`https://www.reddit.com${post.data.permalink}`}" class="flex items-center gap-1 h-[2em]">
                       <i class="icon">${unsafeHTML(replyIcon)}</i> Reply
                    </a>
                    ${
                       post.data.is_gallery
                          ? html` <span class="flex items-center gap-1 cursor-pointer h-[2em]" x-id="gallery">
                               <i class="icon">${unsafeHTML(imageIcon)}</i>
                               <span class="text-primary">${addCommasToNumber(Object.keys(post.data.gallery_data.items ?? []).length)}</span>
                            </span>`
                          : ""
                    }
                 </div>
              `
            : ""}
      </article>
   `);
   const { contentDom, comments, gallery } = elements<{ contentDom: HTMLElement; comments: HTMLElement; gallery: HTMLElement }>(postDom[0]);
   onVisibleOnce(postDom[0], () => {
      const media = renderRedditMedia(post, contentDom);
      contentDom.append(...media);
      setLinkTargetsToBlank(contentDom);

      if (gallery) {
         const img = contentDom.querySelector("img");
         if (img) {
            gallery.addEventListener("click", () => img.click());
         }
      }
   });

   return postDom;
}

export async function renderRedditComments(source: RedditSource, permalink: string) {
   const content = dom(html`<div class="comments"></div>`)[0];
   const loader = renderContentLoader();
   content.append(loader);
   renderOverlay(location.hash.substring(1), [content]);

   const result = await source.getComments(permalink);
   if (result instanceof Error) {
      content.append(...renderErrorMessage("Could not load comments"));
      return;
   }
   const { post, comments } = result;
   loader.remove();
   content.append(...renderRedditPost(post, false));
   content.append(
      ...renderInfoMessage(html`<div class="flex flex-row items-center gap-4">
         <span>${addCommasToNumber(post.data.num_comments)} comments</span>
         <div class="flex items-flex-start gap-4">
            <a href="${`https://www.reddit.com${post.data.permalink}`}" class="flex items-center gap-1 h-[2em]">
               <i class="icon">${unsafeHTML(replyIcon)}</i> Reply
            </a>
         </div>
      </div> `)
   );

   const scrollWrapper = dom(html`<div class="pt-2 w-full overflow-auto"></div>`)[0];
   content.append(scrollWrapper);
   scrollWrapper.append(...renderComments(comments, renderRedditComment, { op: post.data.author, isReply: false, parentLink: post.data.permalink, postLink: post.data.permalink }));
   setLinkTargetsToBlank(content);
}

export function renderRedditComment(comment: RedditComment, state: { op: string; isReply: boolean, parentLink: string, postLink: string }): TemplateResult {
   if (comment.kind == "more") {
      return html`<a href="https://www.reddit.com${state?.parentLink}" class="flex items-center gap-1 h-[2em]">
               More replies on Reddit
            </a>`
   }
   const date = dateToText(comment.data.created_utc * 1000);
   const authorUrl = "https://www.reddit.com/u/" + comment.data.author;
   return html`
      <div class="comment ${state.isReply ? "reply" : ""}">
         <div class="flex gap-1 text-sm items-center text-color/50">
            <a href="${authorUrl}" class="${state?.op == comment.data.author ? "" : "text-color"} font-bold">${comment.data.author}</a>
            <span class="flex items-center text-color/50">•</span>
            <span class="flex items-center text-color/50">${date}</span>
         </div>
         <div class="content">${safeHTML(htmlDecode(comment.data.body_html))}</div>
         <div class="comment-buttons">
            <a href="${`https://www.reddit.com${comment.data.permalink}`}" class="flex items-center gap-1 h-[2em]">
               <i class="icon">${unsafeHTML(replyIcon)}</i> Reply
            </a>
         </div>
         ${
            comment.data.replies && comment.data.replies.data.children.length > 0
               ? html`
                    <div class="replies">
                       ${map(comment.data.replies.data.children, (reply) => renderRedditComment(reply, { op: state?.op, isReply: true, parentLink: comment.data.permalink, postLink: state?.postLink}))}
                    </div>
                 `
               : ""
         }
         </div>
      </div>
   `;
}
