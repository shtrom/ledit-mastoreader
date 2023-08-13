export function dateToText(utcTimestamp: number): string {
   const now = Date.now();
   const timeDifference = now - utcTimestamp;

   const seconds = Math.floor(timeDifference / 1000);
   if (seconds < 60) {
      return seconds + "s";
   }

   const minutes = Math.floor(timeDifference / (1000 * 60));
   if (minutes < 60) {
      return minutes + "m";
   }

   const hours = Math.floor(timeDifference / (1000 * 60 * 60));
   if (hours < 24) {
      return hours + "h";
   }

   const days = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
   if (days < 30) {
      return days + "d";
   }

   const months = Math.floor(timeDifference / (1000 * 60 * 60 * 24 * 30));
   if (months < 12) {
      return months + "mo";
   }

   const years = Math.floor(timeDifference / (1000 * 60 * 60 * 24 * 365));
   return years + "y";
}

export function onVisibleOnce(target: Element, callback: () => void) {
   let callbackTriggered = false;

   const observer = new IntersectionObserver(
      (entries) => {
         entries.forEach((entry) => {
            if (entry.isIntersecting) {
               callbackTriggered = true;
               callback();
               observer.unobserve(entry.target);
            }
         });
      },
      {
         root: null,
         rootMargin: "200px",
         threshold: 0.01,
      }
   );
   observer.observe(target);
}

export function onAddedToDOM(element: Element, callback: () => void) {
   const checkForInsertion = () => {
      if (element.isConnected) {
         callback();
      } else {
         requestAnimationFrame(checkForInsertion);
      }
   };
   checkForInsertion();
}

export function htmlDecode(input: string) {
   var doc = new DOMParser().parseFromString(input, "text/html");
   return doc.documentElement.textContent;
}

export function intersectsViewport(element: Element | null) {
   if (element == null) return false;
   var rect = element.getBoundingClientRect();
   var windowHeight = window.innerHeight || document.documentElement.clientHeight;
   var windowWidth = window.innerWidth || document.documentElement.clientWidth;
   var verticalVisible = rect.top <= windowHeight && rect.bottom >= 0;
   var horizontalVisible = rect.left <= windowWidth && rect.right >= 0;
   return verticalVisible && horizontalVisible;
}

/**
 * Converts the HTML string to DOM nodes.
 */
export function dom(html: string): HTMLElement[] {
   const div = document.createElement("div");
   div.innerHTML = html;
   const children: Element[] = [];
   for (let i = 0; i < div.children.length; i++) {
      children.push(div.children[i]);
   }
   return children as HTMLElement[];
}

/** Navigate to the given feed. */
export function navigate(feed: string) {
   window.location.hash = feed;
   window.location.reload();
}

export function addCommasToNumber(number: number) {
   return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function onTapped(element: HTMLElement, callback: () => void) {
   let touchStartY = 0;

   element.addEventListener("touchstart", (event) => {
      touchStartY = event.touches[0].clientY;
   });

   element.addEventListener("touchend", (event) => {
      if (Math.abs(event.changedTouches[0].clientY - touchStartY) < 16) {
         callback();
      }
   });
}

export function insertAfter(newNode: HTMLElement, referenceNode: HTMLElement) {
   referenceNode.parentNode?.insertBefore(newNode, referenceNode.nextSibling);
}

export function computedCssSizePx(variableName: string) {
   const computedStyles = getComputedStyle(document.documentElement);
   const variableValue = computedStyles.getPropertyValue(variableName);
   return parseInt(variableValue, 10);
}

export function makeCollapsible(div: HTMLElement, maxHeightInLines: number) {
   requestAnimationFrame(() => {
      const computedStyles = getComputedStyle(document.documentElement);
      const fontSize = parseInt(computedStyles.getPropertyValue("--ledit-font-size"), 10);

      const maxHeight = fontSize * maxHeightInLines;
      const clickableAreaHeight = fontSize * 2;

      if (div.clientHeight > maxHeight) {
         div.style.height = `${maxHeight}px`;
         div.style.overflow = "hidden";
         div.style.marginBottom = "0";

         const loadMoreDiv = document.createElement("div");
         loadMoreDiv.classList.add("load-more");
         loadMoreDiv.textContent = "Show more";
         loadMoreDiv.style.height = `${clickableAreaHeight}px`;

         let collapsed = true;
         const loadMore = (event: MouseEvent) => {
            if ((event.target as HTMLElement).tagName != "A") {
               event.preventDefault();
               event.stopPropagation();

               if (collapsed) {
                  div.style.height = "auto";
                  loadMoreDiv.style.display = "none";
               } else {
                  div.style.height = `${maxHeight}px`;
                  loadMoreDiv.style.display = "";
                  if (div.getBoundingClientRect().top < 16 * 4) {
                     window.scrollTo({ top: div.getBoundingClientRect().top + window.pageYOffset - 16 * 3 });
                  }
               }
               collapsed = !collapsed;
            }
         };
         div.addEventListener("click", loadMore);
         loadMoreDiv.addEventListener("click", loadMore);

         div.insertAdjacentElement("afterend", loadMoreDiv);
      }
   });
}

export function removeTrailingEmptyParagraphs(htmlString: string): string {
   const parser = new DOMParser();
   const parsedDoc = parser.parseFromString(htmlString, "text/html");

   const paragraphs = parsedDoc.querySelectorAll("p");
   let lastNonEmptyParagraphIndex = -1;

   // Find the index of the last non-empty paragraph
   for (let i = paragraphs.length - 1; i >= 0; i--) {
      const paragraphText = paragraphs[i].textContent?.trim() || "";
      if (paragraphText !== "") {
         lastNonEmptyParagraphIndex = i;
         break;
      }
   }

   if (lastNonEmptyParagraphIndex >= 0) {
      // Remove the empty paragraphs after the last non-empty paragraph
      for (let i = paragraphs.length - 1; i > lastNonEmptyParagraphIndex; i--) {
         paragraphs[i].parentNode?.removeChild(paragraphs[i]);
      }
   }

   return parsedDoc.body.innerHTML;
}

type NavigationCallback = () => boolean;

class NavigationGuard {
   private stack: NavigationCallback[][] = [[]];
   private listener;

   constructor() {
      history.scrollRestoration = "manual";
      this.listener = this.handlePopState.bind(this);
      window.addEventListener("popstate", this.listener);
   }

   numCallbacks() {
      let num = 0;
      for (const callbacks of this.stack) {
         num += callbacks.length;
      }
      return num;
   }

   push() {
      this.stack.push([]);
   }

   registerCallback(callback: NavigationCallback): void {
      this.stack[this.stack.length - 1].push(callback);
      if (history.state != "guard") history.pushState("guard", "", null);
   }

   removeCallback(callback: NavigationCallback): void {
      for (const callbacks of this.stack) {
         const index = callbacks.indexOf(callback);
         if (index !== -1) {
            callbacks.splice(index, 1);
         }
      }
   }

   pop() {
      this.stack.pop();
   }

   canNavigateBack(): boolean {
      const callbacks = [...this.stack[this.stack.length - 1]];
      let canNavigate = true;
      for (const callback of callbacks) {
         if (!callback()) {
            canNavigate = false;
         }
      }
      return canNavigate;
   }

   private handlePopState(event: PopStateEvent): void {
      if (!this.canNavigateBack()) {
         event.preventDefault();
         history.forward();
      } else {
         if(history.state == "guard") history.back();
      }
   }
}

export const navigationGuard = new NavigationGuard();
