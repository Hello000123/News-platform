import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";

import { submitAccountRequest } from "@/lib/server/auth/account-service";
import type { AccountRequestInput } from "@/lib/shared/auth-contracts";
import { MAX_UPLOAD_BYTES } from "@/lib/shared/file-upload";

const input: AccountRequestInput = {
  fullName: "Upload Limit Applicant",
  email: "upload-limit@example.test",
  phone: "+852 2345 6789",
  company: "Example News",
  department: "Editorial",
  jobTitle: "Editor",
  adminMessage: "",
};

function metadataFile(name: string, size: number) {
  const file = new File(["test"], name, { type: "application/pdf" });
  Object.defineProperty(file, "size", { configurable: true, value: size });
  return file;
}

describe("account-request combined upload limit", () => {
  it("rejects multiple files above 10 MB before storage or persistence", async () => {
    await expect(
      submitAccountRequest(
        {} as D1Database,
        input,
        "https://pressready.example",
        [
          metadataFile("six.pdf", 6 * 1024 * 1024),
          metadataFile("over.pdf", 4 * 1024 * 1024 + 1),
        ],
      ),
    ).rejects.toMatchObject({
      code: "UPLOAD_TOTAL_TOO_LARGE",
      status: 413,
      message: expect.stringContaining("combined size"),
    });
  });

  it("rejects a single file larger than 10 MB before storage or persistence", async () => {
    await expect(
      submitAccountRequest(
        {} as D1Database,
        input,
        "https://pressready.example",
        [metadataFile("large.pdf", MAX_UPLOAD_BYTES + 1)],
      ),
    ).rejects.toMatchObject({
      code: "UPLOAD_TOTAL_TOO_LARGE",
      status: 413,
    });
  });
});
