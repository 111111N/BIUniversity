import { downloadAssignmentFile, type Assignment } from "../../../data/assignmentStore";
import { getAssignmentAttachmentName } from "../../../domain/assignmentAttachments";
import DownloadButton from "../../DownloadButton";

interface Props {
  attachment: Pick<Assignment, "attachmentId" | "attachmentName">;
  kind?: "task" | "answer";
  className?: string;
}

const AssignmentFile = ({ attachment, kind = "task", className }: Props) => {
  const id = attachment.attachmentId;
  const name = getAssignmentAttachmentName(attachment, kind);
  if (!id || !name) return null;
  const errorMessage = `${kind === "task" ? "Файл задания" : "Файл ответа"} недоступен. Попробуйте ещё раз. Если ошибка повторится, обратитесь к администратору.`;
  const download = async () => {
    try { await downloadAssignmentFile(id, name); }
    catch (error) {
      console.error(kind === "task" ? "Не удалось скачать файл задания." : "Не удалось скачать вложение ответа студента.", error);
      throw error;
    }
  };

  return <DownloadButton key={id} name={name} className={className} errorMessage={errorMessage} onDownload={download} />;
};

export default AssignmentFile;
