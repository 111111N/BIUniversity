export interface AccountSubmitInput {
  mode: "create" | "details" | "role";
  busy: boolean;
  unavailable: boolean;
  stale: boolean;
  restriction: string;
  needsNumber: boolean;
  hasNumber: boolean;
  campus?: number;
  numberLoading: boolean;
  numberError: string;
  missingGroup: boolean;
  changed: boolean;
}

export function getAccountSubmitState(input: AccountSubmitInput): { disabled: boolean; hint: string } {
  if (input.busy) return { disabled: true, hint: "Сохраняем учётную запись. Дождитесь результата." };
  if (input.unavailable) return { disabled: true, hint: "Данные недоступны. Повторите чтение перед сохранением; введённые значения остаются в форме." };
  if (input.stale) return { disabled: true, hint: "Данные или права изменились. Обновите карточку перед сохранением." };
  if (input.restriction) return { disabled: true, hint: input.restriction };
  if (input.needsNumber && !input.hasNumber) {
    if (!input.campus) return { disabled: true, hint: input.missingGroup ? "Выберите учебную группу и корпус, чтобы получить номер зачетки." : "Выберите учебный корпус, чтобы получить номер зачетки." };
    if (input.numberLoading) return { disabled: true, hint: "Получаем номер зачетки. После загрузки проверьте его перед продолжением." };
    if (input.numberError) return { disabled: true, hint: "Номер зачетки не получен. Повторите получение номера в блоке выше." };
    return { disabled: true, hint: "Получите актуальный номер зачетки в блоке выше перед продолжением." };
  }
  if (input.mode !== "create" && !input.changed) return { disabled: true, hint: input.mode === "role" ? "Выберите другой тип учётной записи для проверки изменений." : "Нет изменений для сохранения." };
  if (input.missingGroup) return { disabled: false, hint: "Выберите учебную группу студента. При отправке форма покажет незаполненные поля." };
  return { disabled: false, hint: input.mode === "role" ? "Сначала проверьте новые права. Тип изменится после подтверждения." : input.mode === "create" && input.needsNumber ? "Проверьте группу, корпус и номер. Учётка и зачетка появятся после создания." : input.mode === "create" ? "Учётная запись появится после создания." : "Изменятся только личные данные этой учётки." };
}
