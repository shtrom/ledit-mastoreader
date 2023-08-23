import { getSource } from "./data";

class BaseGuard<T> {
   private callbacks: { [zIndex: number]: T[] } = {};

   register(zIndex: number, callback: T): T {
      if (!this.callbacks[zIndex]) {
         this.callbacks[zIndex] = [];
      }
      this.callbacks[zIndex].push(callback);
      return callback;
   }

   remove(callback: T | undefined) {
      if (!callback) return;
      for (const zIndex in this.callbacks) {
         this.callbacks[zIndex] = this.callbacks[zIndex].filter((cb) => cb !== callback);
         if (this.callbacks[zIndex].length == 0) {
            delete this.callbacks[zIndex];
         }
      }
   }

   protected getTop(): T[] {
      const topZIndex = this.getTopZIndex();
      const topCallbacks: T[] = [];
      if (topZIndex >= 0) {
         topCallbacks.push(...this.callbacks[topZIndex]);
      }
      return topCallbacks;
   }

   protected getTopZIndex(): number {
      const zIndices = Object.keys(this.callbacks)
         .map(Number)
         .sort((a, b) => b - a);
      if (zIndices.length == 0) return -1;
      return zIndices[0];
   }

   protected getZIndices() {
      return Object.keys(this.callbacks)
         .map(Number)
         .sort((a, b) => b - a);
   }
}

export type NavigationCallback = () => boolean;

class NavigationGuard extends BaseGuard<NavigationCallback> {
   private stateSetup = false;
   private hash: string | null = null;

   constructor() {
      super();
      history.scrollRestoration = "manual";
      let state = 0;
      window.addEventListener("popstate", (event: PopStateEvent) => {
         if ((state = event.state)) {
            if (!this.canNavigateBack()) {
               history.go(1);
            } else {
               history.go(-1);
            }
         } else {
            if (this.hash) {
               const hash = this.hash;
               console.log("Replacing hash " + window.location.hash + " -> " + hash);
               history.replaceState(history.state, "", hashToUrl(hash!));
               window.dispatchEvent(new HashChangeEvent("hashchange"));
               this.hash = null;
            }
         }
         console.log("Popped state " + window.location.hash);
      });
   }

   register(zIndex: number, callback: NavigationCallback): NavigationCallback {
      if (!this.stateSetup) {
         console.log("Setting up back guard state, " + history.length + ", " + history.state);
         history.replaceState(-1, "");
         history.pushState(0, "");
         console.log("done, " + history.length + ", " + history.state);
         this.stateSetup = true;
      }
      return super.register(zIndex, callback);
   }

   canNavigateBack(): boolean {
      const callbacks = this.getTop();
      let canNavigate = true;
      for (const callback of callbacks) {
         if (!callback()) {
            canNavigate = false;
         }
      }
      return canNavigate;
   }

   hashes: string[] = [];
   pushHash(hash: string) {
      if (hash == window.location.hash) return;
      this.hashes.push(window.location.hash);
      history.replaceState(history.state, "", hashToUrl(hash));
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      console.log("pushing hash " + this.hashes[this.hashes.length - 1] + " -> " + hash);
   }

   popHash(fallback: string) {
      const currHash = window.location.hash;
      const hash = this.hashes.pop();
      if (hash) this.hash = hash
      else this.hash = fallback;
      history.replaceState(history.state, "", hashToUrl(this.hash));
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      console.log("popping hash " + currHash + " -> " + this.hash);
   }
}

function hashToUrl(hash: string) {
   const currentUrl = new URL(window.location.href);
   currentUrl.hash = hash;
   return currentUrl.toString();
}

export const navigationGuard = new NavigationGuard();

export type EscapeCallback = () => void;

export class EscapeGuard extends BaseGuard<EscapeCallback> {
   private listener;

   constructor() {
      super();
      this.listener = this.handleEscape.bind(this);
      document.addEventListener("keydown", this.listener);
   }

   private handleEscape(event: KeyboardEvent): void {
      if (event.keyCode == 27 || event.key == "Escape") {
         const callbacks = [...this.getTop()];
         for (const callback of callbacks) {
            callback();
         }
      }
   }
}

export const escapeGuard = new EscapeGuard();
