export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_MEGABYTES = 10;
export const MAX_UPLOAD_FILES = 50;

export const COMBINED_UPLOAD_LIMIT_ERROR =
  "The combined size of all selected files cannot exceed the 10 MB limit.";
export const UPLOAD_FILE_COUNT_ERROR = `Select no more than ${MAX_UPLOAD_FILES} files per submission.`;

export const SUPPORTED_UPLOADS = {
  ".pdf": {
    label: "PDF",
    mimeTypes: ["application/pdf"],
  },
  ".docx": {
    label: "Microsoft Word",
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
  ".pptx": {
    label: "Microsoft PowerPoint",
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
  },
  ".xlsx": {
    label: "Microsoft Excel",
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
  },
  ".png": {
    label: "PNG image",
    mimeTypes: ["image/png"],
  },
  ".jpg": {
    label: "JPEG image",
    mimeTypes: ["image/jpeg"],
  },
  ".jpeg": {
    label: "JPEG image",
    mimeTypes: ["image/jpeg"],
  },
  ".webp": {
    label: "WebP image",
    mimeTypes: ["image/webp"],
  },
} as const;

export type SupportedUploadExtension = keyof typeof SUPPORTED_UPLOADS;
export type SupportedUploadMime =
  (typeof SUPPORTED_UPLOADS)[SupportedUploadExtension]["mimeTypes"][number];

export const FILE_UPLOAD_ACCEPT = Object.entries(SUPPORTED_UPLOADS)
  .flatMap(([extension, format]) => [extension, ...format.mimeTypes])
  .join(",");

export const SUPPORTED_UPLOAD_HELP =
  "PDF, DOCX, PPTX, XLSX, PNG, JPG, JPEG, or WebP; 10 MB combined maximum.";

export interface UploadMetadata {
  name: string;
  type: string;
  size: number;
}

export interface UploadMetadataValidation {
  extension: SupportedUploadExtension;
  mimeType: SupportedUploadMime;
  formatLabel: string;
}

export interface UploadSelectionResult<T extends UploadMetadata> {
  selected: T[];
  accepted: T[];
  errors: string[];
  totalBytes: number;
}

export function uploadExtension(fileName: string) {
  const normalized = fileName.normalize("NFC").trim().toLowerCase();
  const dot = normalized.lastIndexOf(".");
  return dot >= 0 ? normalized.slice(dot) : "";
}

export function validateUploadMetadata(
  file: UploadMetadata,
): UploadMetadataValidation | { error: string } {
  if (!file.name.trim()) {
    return { error: "Choose a file before continuing." };
  }
  if (file.size <= 0) {
    return { error: "The selected file is empty." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      error: `The selected file is larger than the ${MAX_UPLOAD_MEGABYTES} MB limit.`,
    };
  }

  const extension = uploadExtension(file.name);
  if (!(extension in SUPPORTED_UPLOADS)) {
    return {
      error:
        "Unsupported file format. Choose a PDF, DOCX, PPTX, XLSX, PNG, JPG, JPEG, or WebP file.",
    };
  }

  const supportedExtension = extension as SupportedUploadExtension;
  const mimeType = file.type.trim().toLowerCase();
  const format = SUPPORTED_UPLOADS[supportedExtension];
  if (!(format.mimeTypes as readonly string[]).includes(mimeType)) {
    return {
      error:
        "The file type does not match its extension. Export the file again and retry.",
    };
  }

  return {
    extension: supportedExtension,
    mimeType: mimeType as SupportedUploadMime,
    formatLabel: format.label,
  };
}

export function totalUploadBytes(files: readonly UploadMetadata[]) {
  return files.reduce((total, file) => total + file.size, 0);
}

export function validateUploadCollection(files: readonly UploadMetadata[]) {
  if (files.length > MAX_UPLOAD_FILES) {
    return { error: UPLOAD_FILE_COUNT_ERROR } as const;
  }
  for (const file of files) {
    const validation = validateUploadMetadata(file);
    if ("error" in validation) return validation;
  }
  const totalBytes = totalUploadBytes(files);
  if (totalBytes > MAX_UPLOAD_BYTES) {
    return { error: COMBINED_UPLOAD_LIMIT_ERROR } as const;
  }
  return { totalBytes } as const;
}

export function addUploadsWithinLimit<T extends UploadMetadata>(
  current: readonly T[],
  candidates: readonly T[],
): UploadSelectionResult<T> {
  const selected = [...current];
  const accepted: T[] = [];
  const errors: string[] = [];
  let totalBytes = totalUploadBytes(selected);

  for (const file of candidates) {
    if (selected.length >= MAX_UPLOAD_FILES) {
      errors.push(UPLOAD_FILE_COUNT_ERROR);
      continue;
    }
    const validation = validateUploadMetadata(file);
    if ("error" in validation) {
      errors.push(`${file.name || "Selected file"}: ${validation.error}`);
      continue;
    }
    if (totalBytes + file.size > MAX_UPLOAD_BYTES) {
      errors.push(`${file.name}: ${COMBINED_UPLOAD_LIMIT_ERROR}`);
      continue;
    }
    selected.push(file);
    accepted.push(file);
    totalBytes += file.size;
  }

  return {
    selected,
    accepted,
    errors: [...new Set(errors)],
    totalBytes,
  };
}

export function sanitizeUploadFileName(fileName: string) {
  const normalized = fileName
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/gu, "")
    .replace(/[\\/:"*?<>|]/gu, "_")
    .replace(/\s+/gu, " ")
    .replace(/^\.+/gu, "")
    .trim()
    .slice(0, 180)
    .replace(/[.\s]+$/gu, "");
  return normalized || "uploaded-file";
}

export function isImageUploadMime(mimeType: string) {
  return ["image/png", "image/jpeg", "image/webp"].includes(
    mimeType.toLowerCase(),
  );
}
