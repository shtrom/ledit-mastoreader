class BaseGuard<T> {
   private callbacks: T[] = [];

   register(callback: T): T {
      this.callbacks.push(callback);
      return callback;
   }

   remove(callback: T | undefined) {
      if (!callback) return;
      this.callbacks = this.callbacks.filter((cb) => cb !== callback);
   }

   protected getTop(): T | undefined {
      return this.callbacks[this.callbacks.length - 1];
   }
}

export type NavigationCallback = () => void;

class NavigationGuard extends BaseGuard<NavigationCallback> {
   private popStateListener;
   private inPopState = false;
   private call = true;

   constructor() {
      super();
      history.scrollRestoration = "manual";

      this.popStateListener = (event: PopStateEvent) => {
         this.inPopState = true;
         if (this.call) {
            const callback = this.getTop();
            if (callback) callback();
         } else {
            this.call = true;
         }
         this.inPopState = false;
      };
      window.addEventListener("popstate", this.popStateListener);
   }

   remove(callback: NavigationCallback) {
      super.remove(callback);
      if (!this.inPopState) {
         this.call = false;
         history.back();
      }
   }
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
         const callback = this.getTop();
         if (callback) callback();
      }
   }
}

export const escapeGuard = new EscapeGuard();
