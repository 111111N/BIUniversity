interface SearchKeyEvent {
  key: string;
  keyCode: number;
  nativeEvent: { isComposing: boolean };
  preventDefault(): void;
}

export const searchOnEnter = (event: SearchKeyEvent, onSearch: () => void) => {
  if (event.key !== "Enter" || event.nativeEvent.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  onSearch();
};
