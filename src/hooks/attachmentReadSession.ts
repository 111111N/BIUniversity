export const createAttachmentReadSession = () => {
  let sequence = 0;
  let busy = false;
  return {
    invalidate() { sequence++; busy = false; },
    begin() {
      if (busy) return null;
      busy = true;
      return ++sequence;
    },
    isCurrent(id: number) { return id === sequence; },
    finish(id: number) {
      if (id !== sequence) return false;
      busy = false;
      return true;
    },
  };
};
