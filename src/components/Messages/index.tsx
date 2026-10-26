import ProfileLink from "../ProfileLink";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { STUDENT_PROFILES } from "../../data/studentProfiles";
import { TEACHER_PROFILES } from "../../data/teacherProfiles";
import { getAcademicGroup, getAcademicGroupByName, getAcademicSubjectByName } from "../../data/academicCatalog";
import { createEmptyMessagingState, messageRepository, type MessagingState, type MessageTab, type StoredMessage, type StoredMessageGroup } from "../../data/messageStore";
import { messageAttachmentRepository } from "../../data/messageAttachmentRepository";
import { deliverDirectMessage, recoverDemoDirectMessages } from "../../data/messageDelivery";
import { getAttachmentError } from "../../domain/files";
import { matchesSearchText } from "../../domain/search";
import type { MessagingContact } from "../../domain/messaging";
import { getStudentGroupId } from "../../domain/accounts";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { changesMessageContact } from "../../domain/unsavedNavigation";
import useMessageDrafts from "../../hooks/useMessageDrafts";
import { useRole } from "../RoleContext";
import Checkbox from "../Checkbox";
import ConfirmDialog from "../ConfirmDialog";
import Modal from "../Modal";
import SearchField from "../SearchField";
import MessageThread, { type ThreadPosition } from "./MessageThread";
import MessageComposer from "./MessageComposer";
import MessageActionIcon from "./MessageActionIcon";
import DialogListItem from "./DialogListItem";
import ContactPicker from "./ContactPicker";
import styles from "./index.module.scss";

type Kind = "student" | "teacher" | "group";
type Contact = MessagingContact;
type InboxTab = "all" | MessageTab;
type GroupEditor = { groupId?: string; name: string; memberIds: string[] };
type PendingAction = { kind: "delete"; contactId: string; messages: StoredMessage[]; group: boolean } | { kind: "leave"; group: StoredMessageGroup };
const TABS: InboxTab[] = ["all", "students", "teachers", "groups"];
const kindFor = (tab: InboxTab): Kind | null => tab === "all" ? null : tab === "students" ? "student" : tab === "teachers" ? "teacher" : "group";
const tabFor = (kind: Kind): MessageTab => kind === "student" ? "students" : kind === "teacher" ? "teachers" : "groups";
const initialsFor = (name: string) => name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2);
const DEFAULT_GROUPS: StoredMessageGroup[] = [{
  id: "group-112", name: "Кураторы 112-МКо", createdAt: 0,
  memberIds: ["risk-anna-kuznetsova", "risk-elena-petrova", "teacher-orlova", "teacher-elena-volkova", "risk-maxim-sokolov"],
}];
const DEFAULT_MESSAGES: StoredMessage[] = [
  { id: 1, incoming: true, text: "Здравствуйте! Подскажите, пожалуйста, до какого числа можно сдать практическую работу?", time: "10:24" },
  { id: 2, incoming: false, text: "Здравствуйте. Работу можно загрузить до пятницы включительно.", time: "10:31" },
];
const profileHref = (contact: Contact) => contact.kind === "student" ? "/students/" + contact.id : "/teachers/" + contact.id;
const mergeGroups = (groups: StoredMessageGroup[]) => Array.from(new Map(groups.map((group) => [group.id, group])).values());

type MessagesProps = { initialContactId?: string | null; initialThreadTop?: number };
const Messages = (props: MessagesProps) => {
  const { role } = useRole();
  return role === "configurator" ? null : <AcademicMessages {...props} role={role} />;
};
const AcademicMessages = ({ initialContactId, initialThreadTop, role }: MessagesProps & { role: "teacher" | "student" }) => {
  const { currentUser, accounts } = useRole();
  const componentId = useId();
  const editorHeadingId = useId();
  const self: Contact = { id: currentUser.id, name: currentUser.name, initials: initialsFor(currentUser.name), subtitle: "Вы", kind: role };
  const people = useMemo<Contact[]>(() => [
    ...accounts.filter((account) => account.role !== "configurator").map((account) => ({ id: account.id, initials: initialsFor(account.name), name: account.name, subtitle: account.role === "student" ? getAcademicGroup(getStudentGroupId(account))?.name ?? "Группа не указана" : TEACHER_PROFILES.find((teacher) => teacher.id === account.id)?.department ?? "Преподаватель", kind: account.role as "teacher" | "student" })),
    ...STUDENT_PROFILES.map((student) => ({ id: student.id, initials: student.initials, name: student.name, subtitle: student.group, kind: "student" as const })),
    ...TEACHER_PROFILES.map((teacher) => ({ id: teacher.id, initials: teacher.initials, name: teacher.name, subtitle: teacher.department, kind: "teacher" as const })),
  ].filter((person, index, list) => person.id !== currentUser.id && !accounts.some((account) => account.id === person.id && account.role === "configurator") && list.findIndex((item) => item.id === person.id) === index), [currentUser.id, accounts]);
  const relatedGroupIds = useMemo(() => new Set([...currentUser.memberships.flatMap((membership) => membership.groupIds), ...getStudentGroupId(currentUser) ? [getStudentGroupId(currentUser)!] : []]), [currentUser]);
  const studentSubjects = new Set(currentUser.memberships.map((membership) => membership.subjectId));
  const initialPeople = people.filter((person) => {
    if (person.kind === "student") return relatedGroupIds.has(getAcademicGroupByName(person.subtitle)?.id ?? "");
    if (role === "teacher") return true;
    const account = accounts.find((item) => item.id === person.id && item.role === "teacher");
    if (account) return account.memberships.some((entry) => studentSubjects.has(entry.subjectId) && entry.groupIds.some((groupId) => relatedGroupIds.has(groupId)));
    const profile = TEACHER_PROFILES.find((teacher) => teacher.id === person.id);
    return Boolean(profile?.subjects.some((subject) => studentSubjects.has(getAcademicSubjectByName(subject)?.id ?? "")));
  });
  const [initialSnapshot] = useState(() => messageRepository.readState(role, currentUser.id));
  const hasStoredHistory = useRef(Boolean(initialSnapshot.state));
  const [readError, setReadError] = useState(initialSnapshot.error);
  const [state, setState] = useState<MessagingState>(() => {
    if (initialSnapshot.state) return initialSnapshot.state;
    if (initialSnapshot.error) return createEmptyMessagingState();
    if (currentUser.id !== "anna-smirnova" && currentUser.id !== "teacher-elena-volkova") return createEmptyMessagingState();
    const contact = role === "student" ? people.find((person) => person.id === "teacher-elena-volkova") : initialPeople.find((person) => person.kind === "student");
    return { dialogIds: contact ? [contact.id] : [], messages: contact ? { [contact.id]: DEFAULT_MESSAGES.map((message) => role === "student" ? { ...message, incoming: !message.incoming } : message) } : {}, unread: { students: 0, teachers: 0, groups: 0 } };
  });
  const [draftGroup, setDraftGroup] = useState<StoredMessageGroup | null>(null);
  const groups = mergeGroups([...DEFAULT_GROUPS, ...(state.groups ?? []), ...(draftGroup ? [draftGroup] : [])]).filter((group) => group.memberIds.includes(currentUser.id) && !state.leftGroupIds?.includes(group.id));
  const groupContacts: Contact[] = groups.map((group) => ({ id: group.id, name: group.name, initials: initialsFor(group.name), subtitle: "Участников: " + group.memberIds.length, kind: "group" }));
  const draftContact = draftGroup ? groupContacts.find((contact) => contact.id === draftGroup.id) : undefined;
  const directory = [...people, ...groupContacts];
  const nonEmptyDialogs = directory.filter((contact) => Boolean(state.messages[contact.id]?.length)).sort((a, b) => {
    const lastId = (id: string) => state.messages[id]?.at(-1)?.id ?? 0;
    return lastId(b.id) - lastId(a.id);
  });
  const requested = initialContactId ? directory.find((person) => person.id === initialContactId) : undefined;
  const firstContact = initialContactId ? requested : nonEmptyDialogs[0];
  const [selectedId, setSelectedId] = useState<string | null>(() => !initialContactId && window.matchMedia("(max-width: 700px)").matches ? null : firstContact?.id ?? null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const [tab, setTab] = useState<InboxTab>("all");
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [threadFilesOpen, setThreadFilesOpen] = useState(false);
  const { drafts, errors: draftStorageErrors, saved: savedDrafts, hasUnsavedText, changeDraft, completeDraft, retryDraft, forgetDraft } = useMessageDrafts(role, currentUser.id, [...nonEmptyDialogs.map((contact) => contact.id), ...(selectedId ? [selectedId] : [])], draftGroup?.id);
  const [draftFiles, setDraftFiles] = useState<Record<string, File[]>>({});
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [replies, setReplies] = useState<Record<string, number | undefined>>({});
  const [draggingFiles, setDraggingFiles] = useState(false);
  const dragDepth = useRef(0);
  const [sending, setSending] = useState(false);
  const sendLock = useRef(false);
  const [query, setQuery] = useState("");
  const [membersOpen, setMembersOpen] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<GroupEditor | null>(null);
  const [participantQuery, setParticipantQuery] = useState("");
  const [editorError, setEditorError] = useState("");
  const [scrollRequest, setScrollRequest] = useState(0);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionError, setActionError] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const filesButtonRef = useRef<HTMLButtonElement>(null);
  const threadPositions = useRef(new Map<string, ThreadPosition>(initialContactId && initialThreadTop !== undefined ? [[initialContactId, { top: initialThreadTop, followLatest: false }]] : []));
  useUnsavedChangesWarning(hasUnsavedText || Object.values(draftFiles).some((files) => files.length > 0), changesMessageContact);
  const selected = directory.find((contact) => contact.id === selectedId);
  const selectedGroup = selected?.kind === "group" ? groups.find((group) => group.id === selected.id) : undefined;
  const thread = selected ? state.messages[selected.id] ?? [] : [];
  const draft = selected ? drafts[selected.id] ?? "" : "";
  const files = selected ? draftFiles[selected.id] ?? [] : [];
  const replyId = selected ? replies[selected.id] : undefined;
  const reply = thread.find((message) => message.id === replyId);
  const attachmentScope = (id: string) => `${role}:${encodeURIComponent(currentUser.id)}:${encodeURIComponent(id)}`;
  useEffect(() => { dragDepth.current = 0; setDraggingFiles(false); }, [selectedId, sending, readError]);
  const addFiles = (incoming: FileList | File[]) => {
    if (!selected || sendLock.current || readError) return;
    const additions = Array.from(incoming).filter((file, index, incomingFiles) => ![...files, ...incomingFiles.slice(0, index)].some((existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified));
    const sizeError = additions.map(getAttachmentError).find(Boolean);
    if (files.length + additions.length > 5 || sizeError) { setDraftErrors((current) => ({ ...current, [selected.id]: sizeError || "К сообщению можно приложить до 5 файлов." })); return; }
    setDraftFiles((current) => ({ ...current, [selected.id]: [...files, ...additions] }));
    setDraftErrors((current) => ({ ...current, [selected.id]: "" }));
  };
  const visibleDialogs = nonEmptyDialogs.filter((contact) => (tab === "all" || contact.kind === kindFor(tab)) && matchesSearchText(contact.name + " " + contact.subtitle, query));
  const contactCandidates = !query.trim() || tab === "groups" ? [] : people.filter((contact) => (tab === "all" || contact.kind === kindFor(tab)) && matchesSearchText(contact.name + " " + contact.subtitle, query) && !nonEmptyDialogs.some((dialog) => dialog.id === contact.id));
  const participantResults = people.filter((person) => matchesSearchText(person.name + " " + person.subtitle, participantQuery));
  const existingEditorGroup = editor?.groupId ? groups.find((group) => group.id === editor.groupId) : undefined;
  const participant = (id: string) => id === currentUser.id ? self : people.find((person) => person.id === id);
  const persistedGroups = (source: MessagingState) => mergeGroups([...DEFAULT_GROUPS.filter((group) => group.memberIds.includes(currentUser.id)), ...(source.groups ?? [])]).filter((group) => !source.leftGroupIds?.includes(group.id));

  const refreshHistory = useCallback(() => {
    const snapshot = messageRepository.readState(role, currentUser.id);
    setReadError(snapshot.error);
    if (snapshot.error) return;
    hasStoredHistory.current = true;
    setState(snapshot.state ?? createEmptyMessagingState());
    setStorageError("");
  }, [role, currentUser.id]);
  useEffect(() => messageRepository.subscribe(role, currentUser.id, refreshHistory), [role, currentUser.id, refreshHistory]);
  useEffect(() => {
    let active = true;
    const identities = [...people.flatMap((person) => person.kind === "group" ? [] : [{ id: person.id, role: person.kind }]), { id: currentUser.id, role }];
    void recoverDemoDirectMessages(identities).then((warnings) => { if (active && warnings.length) setStorageError(warnings.join(" ")); }).catch((error) => {
      console.error("Не удалось восстановить доставку переписки:", error);
      if (active) setStorageError("Не удалось восстановить прежние отправления. Сохранённая история не изменена.");
    });
    return () => { active = false; };
  }, [people, currentUser.id, role]);

  const latestOrStop = () => {
    const snapshot = messageRepository.readState(role, currentUser.id);
    setReadError(snapshot.error);
    if (snapshot.error) return null;
    if (snapshot.state) hasStoredHistory.current = true;
    return snapshot.state ?? (hasStoredHistory.current ? createEmptyMessagingState() : state);
  };

  const commit = (next: MessagingState, failure: string, contactId?: string) => {
    if (!messageRepository.save(role, next, currentUser.id)) {
      setReadError(messageRepository.readState(role, currentUser.id).error);
      if (contactId) setDraftErrors((current) => ({ ...current, [contactId]: failure }));
      else setStorageError(failure);
      return false;
    }
    hasStoredHistory.current = true;
    setState(next);
    setStorageError("");
    if (contactId) setDraftErrors((current) => ({ ...current, [contactId]: "" }));
    return true;
  };
  const selectContact = (contact: Contact) => {
    setSelectedId(contact.id); setQuery(""); setMembersOpen(false); setNotice(""); setContactPickerOpen(false); setThreadSearchOpen(false); setThreadFilesOpen(false);
    if (tab !== "all") setTab(tabFor(contact.kind));
    if (window.matchMedia("(min-width: 701px)").matches) requestAnimationFrame(() => composerRef.current?.focus({ preventScroll: true }));
  };
  const selectTab = (next: InboxTab) => {
    setTab(next); setQuery(""); setMembersOpen(false);
  };
  const moveTab = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = TABS.indexOf(tab);
    const next = event.key === "Home" ? TABS[0] : event.key === "End" ? TABS[TABS.length - 1] : TABS[(index + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length];
    selectTab(next);
    requestAnimationFrame(() => document.getElementById(componentId + "-tab-" + next)?.focus());
  };
  const requestAction = (action: PendingAction) => {
    setActionError("");
    setPendingAction(action);
  };
  const confirmAction = async () => {
    if (sendLock.current) return;
    if (!pendingAction) return;
    const latest = latestOrStop();
    if (!latest) { setActionError("Не удалось прочитать переписку. Ничего не изменено; закройте окно и повторите чтение."); return; }
    const action = pendingAction;
    const groupId = action.kind === "leave" ? action.group.id : action.group ? action.contactId : null;
    const latestGroups = mergeGroups([...persistedGroups(latest), ...(draftGroup && !latest.leftGroupIds?.includes(draftGroup.id) ? [draftGroup] : [])]);
    const group = groupId ? latestGroups.find((item) => item.id === groupId && item.memberIds.includes(currentUser.id)) : undefined;
    if (groupId && !group) { setState(latest); setActionError("Вы больше не участник этой беседы. Переписка не изменена."); return; }
    if (action.kind === "delete") {
      const currentThread = latest.messages[action.contactId] ?? [];
      const targets = currentThread.filter((message) => action.messages.some((item) => item.id === message.id));
      if (!targets.length) { setState(latest); setPendingAction(null); setNotice("Сообщения уже удалены."); return; }
      if (targets.some((target) => target.incoming || JSON.stringify(target) !== JSON.stringify(action.messages.find((message) => message.id === target.id)))) { setActionError("Сообщение изменилось или вам не принадлежит. Обновите переписку и повторите действие."); return; }
      const ids = new Set(targets.map((message) => message.id));
      if (!commit({ ...latest, messages: { ...latest.messages, [action.contactId]: currentThread.filter((message) => !ids.has(message.id)) } }, "Не удалось удалить сообщения. История сохранена.")) { setActionError("Не удалось сохранить удаление. Попробуйте ещё раз."); return; }
      setPendingAction(null);
      setNotice(`Удалено из локальной истории: ${targets.length}.`);
      requestAnimationFrame(() => composerRef.current?.focus({ preventScroll: true }));
      try { await messageAttachmentRepository.remove(attachmentScope(action.contactId), targets.flatMap((message) => (message.attachments ?? []).map((file) => file.id))); }
      catch { setNotice("Сообщения удалены. Очистить их файлы в хранилище не удалось."); }
      return;
    } else {
      const next: MessagingState = {
        ...latest,
        dialogIds: latest.dialogIds.filter((id) => id !== action.group.id),
        groups: latestGroups.map((item) => item.id === action.group.id ? { ...item, memberIds: item.memberIds.filter((id) => id !== currentUser.id) } : item),
        leftGroupIds: Array.from(new Set([...(latest.leftGroupIds ?? []), action.group.id])),
      };
      if (!commit(next, "Не удалось выйти из беседы. Участие не изменено.")) { setActionError("Не удалось сохранить выход. Попробуйте ещё раз."); return; }
      if (draftGroup?.id === action.group.id) setDraftGroup(null);
      forgetDraft(action.group.id);
      setDraftFiles((current) => { const nextFiles = { ...current }; delete nextFiles[action.group.id]; return nextFiles; });
      setDraftErrors((current) => { const nextErrors = { ...current }; delete nextErrors[action.group.id]; return nextErrors; });
      setReplies((current) => { const nextReplies = { ...current }; delete nextReplies[action.group.id]; return nextReplies; });
      setSelectedId(null); setMembersOpen(false); setEditor(null);
      setNotice("Вы вышли из беседы. История сохранена в браузере, беседа скрыта из списка.");
      requestAnimationFrame(() => document.getElementById(componentId + "-tab-groups")?.focus({ preventScroll: true }));
    }
    setPendingAction(null);
  };
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if ((!text && !files.length) || !selected || sendLock.current || readError || (replyId !== undefined && !reply)) return;
    sendLock.current = true; setSending(true);
    let attachments: Awaited<ReturnType<typeof messageAttachmentRepository.save>> = [];
    let saved = false;
    try {
      attachments = await messageAttachmentRepository.save(attachmentScope(selected.id), files);
      // Read again after binary storage: another tab may have changed messages or membership.
      const latest = latestOrStop();
      if (!latest) throw new Error("История недоступна. Сообщение не отправлено, черновик сохранён.");
      const latestGroups = mergeGroups([...persistedGroups(latest), ...(draftGroup?.id === selected.id && !latest.leftGroupIds?.includes(draftGroup.id) ? [draftGroup] : [])]);
      if (selected.kind === "group" && !latestGroups.some((group) => group.id === selected.id && group.memberIds.includes(currentUser.id))) throw new Error("Вы не участник этой беседы. Сообщение не отправлено.");
      const currentThread = latest.messages[selected.id] ?? [];
      if (replyId !== undefined && !currentThread.some((message) => message.id === replyId)) throw new Error("Сообщение для ответа уже удалено. Уберите цитату и повторите отправку.");
      const message: StoredMessage = { id: currentThread.reduce((latestId, item) => Math.max(latestId, item.id), Date.now()) + 1, incoming: false, text, sentAt: new Date().toISOString(), time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }), ...(attachments.length ? { attachments } : {}), ...(replyId !== undefined ? { replyTo: replyId } : {}) };
      const next: MessagingState = { ...latest, dialogIds: Array.from(new Set([selected.id, ...latest.dialogIds])), messages: { ...latest.messages, [selected.id]: [...currentThread, message] }, groups: latestGroups, unread: { ...latest.unread, [tabFor(selected.kind)]: 0 } };
      if (selected.kind === "group") {
        if (!commit(next, "Не удалось сохранить сообщение. Черновик остался на месте.", selected.id)) throw new Error("Не удалось сохранить сообщение. Текст и выбранные файлы остались в черновике.");
      } else {
        const delivered = await deliverDirectMessage({ role, id: currentUser.id }, { role: selected.kind, id: selected.id }, message, latest);
        hasStoredHistory.current = true;
        setState(delivered);
        setStorageError("");
        setDraftErrors((current) => ({ ...current, [selected.id]: "" }));
      }
      saved = true;
      if (selectedIdRef.current === selected.id) setScrollRequest((value) => value + 1);
      completeDraft(selected.id);
      setDraftFiles((current) => ({ ...current, [selected.id]: [] }));
      setReplies((current) => ({ ...current, [selected.id]: undefined }));
      if (draftGroup?.id === selected.id) setDraftGroup(null);
      if (selectedIdRef.current === selected.id) setNotice("");
    } catch (error) {
      setDraftErrors((current) => ({ ...current, [selected.id]: error instanceof DOMException ? error.name === "QuotaExceededError" ? "В браузере недостаточно места для вложений. Уберите часть файлов; черновик сохранён." : "Хранилище файлов недоступно. Попробуйте снова; черновик сохранён." : error instanceof Error ? error.message : "Не удалось сохранить вложения. Попробуйте снова, черновик сохранён." }));
      if (!saved && attachments.length) {
        try { await messageAttachmentRepository.remove(attachmentScope(selected.id), attachments.map((file) => file.id)); }
        catch { setDraftErrors((current) => ({ ...current, [selected.id]: "Отправка не завершена. Черновик сохранён, но временные файлы не удалось очистить." })); }
      }
    } finally {
      sendLock.current = false; setSending(false);
      if (selectedIdRef.current === selected.id) requestAnimationFrame(() => composerRef.current?.focus({ preventScroll: true }));
    }
  };
  const openGroupEditor = (group?: StoredMessageGroup) => {
    if (sendLock.current) return;
    if (!group && draftGroup) {
      if (draftContact) { selectContact(draftContact); return; }
      setDraftGroup(null);
    }
    setParticipantQuery(""); setEditorError("");
    setEditor({ groupId: group?.id, name: group?.name ?? "", memberIds: group?.memberIds.filter((id) => id !== currentUser.id) ?? [] });
  };
  const saveGroupEditor = (event: FormEvent) => {
    event.preventDefault();
    if (!editor || !editor.name.trim() || !editor.memberIds.length) return;
    if (editor.groupId) {
      const saved = latestOrStop();
      if (!saved) { setEditorError("История недоступна. Участники не изменены; закройте окно и повторите чтение переписки."); return; }
      const latestGroups = mergeGroups([...persistedGroups(saved), ...(draftGroup?.id === editor.groupId && !saved.leftGroupIds?.includes(draftGroup.id) ? [draftGroup] : [])]);
      const target = latestGroups.find((group) => group.id === editor.groupId);
      if (!target || !target.memberIds.includes(currentUser.id)) { setEditorError("Беседа недоступна. Добавить участников нельзя."); return; }
      const updated = { ...target, memberIds: Array.from(new Set([...target.memberIds, ...editor.memberIds])) };
      if (draftGroup?.id === target.id && !saved.messages[target.id]?.length) setDraftGroup(updated);
      else if (!commit({ ...saved, groups: latestGroups.map((group) => group.id === target.id ? updated : group) }, "Не удалось сохранить участников. Повторите действие.")) { setEditorError("Участники не добавлены. Выбранные люди остались в списке."); return; }
      setNotice("Список участников обновлён.");
    } else {
      const group: StoredMessageGroup = { id: "conversation-" + crypto.randomUUID(), name: editor.name.trim(), memberIds: Array.from(new Set([currentUser.id, ...editor.memberIds])), createdAt: Date.now() };
      setDraftGroup(group); setSelectedId(group.id); setTab("groups"); setQuery(""); setMembersOpen(false); setThreadSearchOpen(false); setThreadFilesOpen(false);
      setNotice("Беседа появится в списке после первого сообщения.");
    }
    setEditor(null);
    requestAnimationFrame(() => composerRef.current?.focus({ preventScroll: true }));
  };
  const tabButton = (id: InboxTab, label: string) => <button id={componentId + "-tab-" + id} aria-controls={componentId + "-panel"} type="button" role="tab" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} className={tab === id ? styles.activeTab : ""} onClick={() => selectTab(id)}>{label}</button>;

  return <div className={`${styles.layout} ${selected ? styles.hasSelection : ""}`}>
    <aside className={styles.contacts} aria-label="Диалоги">
      {readError && <div className={`${styles.readError} ${styles.mobileReadError}`} role="alert"><span>История недоступна. Запись приостановлена, данные сохранены.</span><button type="button" onClick={refreshHistory}>Повторить чтение</button></div>}
      {!selected && notice && <div className={`${styles.notice} ${styles.mobileOnly}`} role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Скрыть уведомление"><MessageActionIcon name="close" /></button></div>}
      <header className={styles.inboxHeader}><div><h2>Чаты</h2><span>{nonEmptyDialogs.length ? `Диалогов: ${nonEmptyDialogs.length}` : "Общение внутри университета"}</span></div><button type="button" className={styles.iconButton} onClick={() => setContactPickerOpen(true)} aria-label="Новый диалог" title="Написать сообщение"><MessageActionIcon name="compose" /></button></header>
      <label className={styles.inboxSearch}><MessageActionIcon name="search" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Чаты, люди, группы" aria-label="Поиск чатов и людей" />{query && <button type="button" aria-label="Очистить поиск" onClick={() => setQuery("")}><MessageActionIcon name="close" /></button>}</label>
      <div className={styles.tabs} role="tablist" aria-label="Категории диалогов" onKeyDown={moveTab}>{tabButton("all", "Все")}{tabButton("students", "Студенты")}{tabButton("teachers", "Преподаватели")}{tabButton("groups", "Беседы")}</div>
      <div className={styles.contactList} id={componentId + "-panel"} role="tabpanel" aria-labelledby={componentId + "-tab-" + tab}>
        {visibleDialogs.map((contact) => <DialogListItem key={contact.id} contact={contact} message={state.messages[contact.id]?.at(-1)} draft={drafts[contact.id]} fileCount={draftFiles[contact.id]?.length} active={selected?.id === contact.id} onClick={() => selectContact(contact)} />)}
        {!visibleDialogs.length && <div className={styles.emptyInbox}><MessageActionIcon name="chat" /><strong>{query.trim() ? "Чаты не найдены" : "Здесь будут ваши диалоги"}</strong><p>{query.trim() ? "Попробуйте другое имя или категорию." : "Напишите студенту, преподавателю или создайте общую беседу."}</p>{!query.trim() && <button type="button" onClick={() => setContactPickerOpen(true)}>Начать общение</button>}</div>}
        {contactCandidates.length > 0 && <div className={styles.newContacts}><h3 className={styles.listHeading}>Люди в университете</h3>{contactCandidates.map((contact) => <DialogListItem key={contact.id} contact={contact} active={selected?.id === contact.id} onClick={() => selectContact(contact)} />)}</div>}
        {draftContact && <button type="button" className={styles.draftGroupButton} onClick={() => selectContact(draftContact)}><MessageActionIcon name="group" /><span>{draftContact.name}<small>Новая беседа · первое сообщение не отправлено</small></span></button>}
      </div>
      <footer className={styles.inboxFooter}><span title="История и файлы сохраняются в этом браузере. Серверная доставка пока не подключена.">Локальный режим</span><button type="button" disabled={sending || Boolean(readError)} onClick={() => openGroupEditor()}><MessageActionIcon name="group" />Создать беседу</button></footer>
    </aside>
    <section className={styles.chat} aria-label="Переписка" onKeyDown={(event) => { if (!event.currentTarget.contains(event.target as Node)) return; if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "f" || event.code === "KeyF") && selected) { event.preventDefault(); setThreadSearchOpen(true); setMembersOpen(false); } }}
      onDragEnter={(event) => { if (!event.currentTarget.contains(event.target as Node) || !event.dataTransfer.types.includes("Files") || !selected || sending || readError) return; event.preventDefault(); dragDepth.current++; setDraggingFiles(true); }}
      onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDraggingFiles(false); }}
      onDragOver={(event) => { if (!event.currentTarget.contains(event.target as Node) || !event.dataTransfer.types.includes("Files")) return; event.preventDefault(); event.dataTransfer.dropEffect = !selected || sending || readError ? "none" : "copy"; }}
      onDrop={(event) => { if (!event.currentTarget.contains(event.target as Node) || !event.dataTransfer.types.includes("Files")) return; event.preventDefault(); dragDepth.current = 0; setDraggingFiles(false); if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files); }}>
      {draggingFiles && <div className={styles.chatDropHint}><MessageActionIcon name="attach" /><strong>Добавить файлы в сообщение</strong><span>Отпустите в любом месте переписки · до 5 файлов по 25 МБ</span></div>}
      {readError && <div className={styles.readError} role="alert"><span>{readError}</span><button type="button" onClick={refreshHistory}>Повторить чтение</button></div>}
      {storageError && <p className={styles.storageError} role="alert">{storageError}</p>}
      {notice && <div className={styles.notice} role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Скрыть уведомление"><MessageActionIcon name="close" /></button></div>}
      {selected ? <>
        <header className={styles.chatHeader}><button type="button" className={styles.mobileBack} onClick={() => { setSelectedId(null); setMembersOpen(false); setThreadSearchOpen(false); setThreadFilesOpen(false); }} aria-label="Назад к чатам"><MessageActionIcon name="back" /></button><span className={styles.avatar}>{selected.kind === "group" ? <MessageActionIcon name="group" /> : selected.initials}</span><div className={styles.chatIdentity}>{selected.kind === "group" ? <button type="button" onClick={() => { setMembersOpen((value) => !value); setThreadSearchOpen(false); }}>{selected.name}</button> : <ProfileLink returnTo={`/messages?contact=${encodeURIComponent(selected.id)}`} to={profileHref(selected)}>{selected.name}</ProfileLink>}<span>{selected.kind === "group" ? selected.subtitle : `${selected.kind === "student" ? "Студент" : "Преподаватель"} · ${selected.subtitle}`}</span></div><div className={styles.headerActions}><button ref={filesButtonRef} type="button" className={styles.iconButton} aria-label="Вложения переписки" title="Все вложения" aria-haspopup="dialog" aria-expanded={threadFilesOpen} onClick={() => setThreadFilesOpen(true)}><MessageActionIcon name="folder" /></button><button type="button" className={styles.iconButton} aria-label="Поиск в переписке" title="Найти сообщение" aria-pressed={threadSearchOpen} onClick={() => { setThreadSearchOpen((value) => !value); setMembersOpen(false); }}><MessageActionIcon name="search" /></button>{selectedGroup && <button type="button" className={styles.iconButton} onClick={() => { setMembersOpen((value) => !value); setThreadSearchOpen(false); }} aria-expanded={membersOpen} aria-label="Участники и действия беседы" title="Участники и действия"><MessageActionIcon name="group" /></button>}</div></header>
        {selectedGroup && membersOpen && <div className={styles.membersPanel}><div className={styles.membersHeading}><strong>Участники · {selectedGroup.memberIds.length}</strong><div className={styles.chatActions}><button type="button" disabled={Boolean(readError) || sending} onClick={() => openGroupEditor(selectedGroup)}>Добавить людей</button><button type="button" className={styles.leaveButton} disabled={Boolean(readError) || sending} onClick={() => requestAction({ kind: "leave", group: selectedGroup })}>Выйти из беседы</button></div></div><div className={styles.membersList}>{selectedGroup.memberIds.map((id) => { const member = participant(id); return member ? <ProfileLink returnTo={`/messages?contact=${encodeURIComponent(selected.id)}`} className={styles.memberCard} key={id} to={profileHref(member)}><span>{member.initials}</span><strong>{member.name}{id === currentUser.id ? " · вы" : ""}</strong></ProfileLink> : <span className={styles.unknownMember} key={id}>Пользователь недоступен</span>; })}</div></div>}
        <MessageThread key={`thread:${selected.id}`} messages={thread} filesOpen={threadFilesOpen} onFilesClose={() => { setThreadFilesOpen(false); requestAnimationFrame(() => filesButtonRef.current?.focus({ preventScroll: true })); }} positions={threadPositions.current} positionKey={selected.id} contactName={selected.name} searchOpen={threadSearchOpen} onSearchClose={() => setThreadSearchOpen(false)} group={selected.kind === "group"} scrollRequest={scrollRequest} attachmentScope={attachmentScope(selected.id)} readOnly={Boolean(readError) || sending} onDelete={(messages) => requestAction({ kind: "delete", contactId: selected.id, messages, group: selected.kind === "group" })} onReply={(message) => { setReplies((current) => ({ ...current, [selected.id]: message.id })); requestAnimationFrame(() => composerRef.current?.focus({ preventScroll: true })); }} />
        {draftErrors[selected.id] && <div className={`${styles.storageError} ${styles.draftError}`} role="alert"><span>{draftErrors[selected.id]}</span><button type="button" onClick={() => setDraftErrors((current) => ({ ...current, [selected.id]: "" }))} aria-label="Скрыть ошибку черновика"><MessageActionIcon name="close" /></button></div>}
        {draftStorageErrors[selected.id] && <div className={`${styles.storageError} ${styles.draftPersistenceError}`} role="alert"><span>{draftStorageErrors[selected.id]}</span><button type="button" onClick={() => retryDraft(selected.id)}>Повторить</button></div>}
        <MessageComposer key={`composer:${selected.id}`} id={componentId + "-message"} inputRef={composerRef} name={selected.name} text={draft} textSaved={Boolean(savedDrafts[selected.id])} newGroup={draftGroup?.id === selected.id} files={files} replyId={replyId} reply={reply} sending={sending} readOnly={Boolean(readError)} localDelivery={selected.kind !== "group"}
          onSubmit={(event) => { void send(event); }} onText={(text) => changeDraft(selected.id, text)} onFiles={addFiles}
          onRemoveFile={(index) => setDraftFiles((current) => ({ ...current, [selected.id]: files.filter((_, fileIndex) => fileIndex !== index) }))}
          onCancelReply={() => setReplies((current) => ({ ...current, [selected.id]: undefined }))} />
      </> : <div className={styles.noSelection}><span className={styles.emptyChatIcon}><MessageActionIcon name="chat" /></span><span className={styles.emptyEyebrow}>Внутренний мессенджер</span><strong>{initialContactId && !requested ? "Собеседник недоступен" : "Важные разговоры — в одном месте"}</strong><p>{initialContactId && !requested ? "Ссылка не найдена или вы больше не участник беседы. Чужая история недоступна." : "Обсудите задание, отправьте материалы или соберите учебную команду. Выберите чат слева или начните новый диалог."}</p><button type="button" onClick={() => setContactPickerOpen(true)}><MessageActionIcon name="compose" />Написать сообщение</button><small>Контакты студентов и преподавателей университета</small></div>}
    </section>
    {contactPickerOpen && <ContactPicker people={people} suggested={initialPeople} onClose={() => setContactPickerOpen(false)} onSelect={selectContact} onCreateGroup={() => { setContactPickerOpen(false); openGroupEditor(); }} />}
    {editor && <Modal labelledBy={editorHeadingId} onClose={() => setEditor(null)} className={styles.groupDialog}><form onSubmit={saveGroupEditor}><header><span>Беседы</span><h2 id={editorHeadingId}>{editor.groupId ? "Добавить участников" : "Новая беседа"}</h2><p>Можно выбрать любого студента или преподавателя. Ваша переписка доступна только участникам.</p></header>{!editor.groupId && <label className={styles.groupName}>Название беседы<input required maxLength={100} value={editor.name} placeholder="Например, проект по статистике" onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>}<SearchField label="Найти участников" value={participantQuery} onChange={setParticipantQuery} placeholder="Любое имя, группа или кафедра" /><div className={styles.participantSummary}>Вы будете участником автоматически · выбрано людей: {editor.memberIds.length}</div><div className={styles.participantList}>{participantResults.map((person) => <Checkbox key={person.id} checked={editor.memberIds.includes(person.id)} disabled={Boolean(existingEditorGroup?.memberIds.includes(person.id))} onChange={(checked) => setEditor({ ...editor, memberIds: checked ? [...editor.memberIds, person.id] : editor.memberIds.filter((id) => id !== person.id) })} label={<span className={styles.participantIdentity}><strong>{person.name}</strong><small>{person.subtitle}{existingEditorGroup?.memberIds.includes(person.id) ? " · уже в беседе" : ""}</small></span>} />)}{!participantResults.length && <p className={styles.emptySearch}>Никого не найдено. Измените запрос.</p>}</div>{editorError && <p className={styles.storageError} role="alert">{editorError}</p>}<footer><button type="button" onClick={() => setEditor(null)}>Отмена</button><button type="submit" disabled={!editor.name.trim() || !editor.memberIds.length || Boolean(existingEditorGroup && editor.memberIds.every((id) => existingEditorGroup.memberIds.includes(id)))}>{editor.groupId ? "Добавить участников" : "К первому сообщению"}</button></footer></form></Modal>}
    {pendingAction && <ConfirmDialog title={pendingAction.kind === "delete" ? `Удалить свои сообщения (${pendingAction.messages.length})?` : "Выйти из беседы?"} confirmLabel={pendingAction.kind === "delete" ? "Удалить" : "Выйти из беседы"} error={actionError} onCancel={() => setPendingAction(null)} onConfirm={() => { void confirmAction(); }}>{pendingAction.kind === "delete" ? <><p>Удаление только из вашей истории в этом браузере, вместе с вложениями. Отменить нельзя. Входящие сообщения не затрагиваются.</p><blockquote className={styles.messagePreview}>{pendingAction.messages.map((message) => message.text || message.attachments?.map((file) => file.name).join(", ")).join("\n\n")}</blockquote></> : <><p>Беседа «{pendingAction.group.name}» будет скрыта, отправлять сообщения в неё больше нельзя. Сохранённая история не удаляется.</p><p>Это локальный прототип: другие участники не получат уведомление, их данные не изменятся. Вернуться самостоятельно пока нельзя.</p>{(drafts[pendingAction.group.id]?.trim() || Boolean(draftFiles[pendingAction.group.id]?.length)) && <p className={styles.draftWarning}>Непереданные файлы и несохранённые изменения текста будут потеряны. Сохранённый текстовый черновик не удалится, но открыть беседу после выхода пока нельзя.</p>}</>}</ConfirmDialog>}
  </div>;
};
export default Messages;
