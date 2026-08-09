// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClientDetail } from "@/components/employee/client-detail";

const mocks = vi.hoisted(() => ({
  getEmployeeClientDetail: vi.fn(),
  generateEmployeeClientSummary: vi.fn(),
}));

vi.mock("@/lib/client/auth-api", () => ({
  AuthRequestError: class AuthRequestError extends Error {},
  getEmployeeClientDetail: mocks.getEmployeeClientDetail,
  generateEmployeeClientSummary: mocks.generateEmployeeClientSummary,
}));

const detail = {
  client: {
    id: "client-1",
    fullName: "Client One",
    email: "client@example.test",
    phone: null,
    company: "Example Company",
    department: "Communications",
    jobTitle: "Editor",
    status: "active" as const,
    createdAt: 1_800_000_000,
  },
  summary: null,
  publishedNews: {
    items: [
      {
        id: "article-1",
        title: "A verified published article",
        publicationDate: 1_800_000_100,
        status: "approved" as const,
        language: "traditional_chinese",
        category: "technology" as const,
        href: "/news/article-1",
      },
    ],
    page: 1,
    pageSize: 10,
    totalItems: 11,
    totalPages: 2,
  },
};

const summary = {
  companyName: "Example Company",
  companyType: "Media technology",
  productsOrServices: ["Newsroom software"],
  shortDescription: "A newsroom software provider.",
  recurringSubjects: ["Publishing technology"],
  insufficientInformation: false,
  sourceArticleCount: 11,
  sourceLatestPublishedAt: 1_800_000_100,
  modelId: "grok-4.5",
  generatedAt: 1_800_000_200,
  generatedBy: { id: "employee-1", fullName: "Employee One" },
};

beforeEach(() => {
  mocks.getEmployeeClientDetail.mockResolvedValue({ detail });
  mocks.generateEmployeeClientSummary.mockResolvedValue({ summary });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("employee client detail", () => {
  it("shows profile and published news, then replaces the empty state with a generated summary", async () => {
    const user = userEvent.setup();
    render(<ClientDetail clientId="client-1" />);

    expect(await screen.findByRole("heading", { name: "Client One" })).toBeTruthy();
    expect(screen.getByText("A verified published article")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open article" }).getAttribute("href")).toBe(
      "/news/article-1",
    );
    await user.click(screen.getByRole("button", { name: "Generate Summary" }));

    expect(await screen.findByText("Media technology")).toBeTruthy();
    expect(screen.getByText("Newsroom software")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Regenerate Summary" })).toBeTruthy();
    expect(mocks.generateEmployeeClientSummary).toHaveBeenCalledWith("client-1");
  });

  it("loads the next server-paginated published-news page", async () => {
    const user = userEvent.setup();
    mocks.getEmployeeClientDetail
      .mockResolvedValueOnce({ detail })
      .mockResolvedValueOnce({
        detail: {
          ...detail,
          publishedNews: {
            ...detail.publishedNews,
            items: [],
            page: 2,
          },
        },
      });
    render(<ClientDetail clientId="client-1" />);
    await screen.findByText("A verified published article");
    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(mocks.getEmployeeClientDetail).toHaveBeenLastCalledWith("client-1", 2);
    });
    expect(await screen.findByText("Page 2 of 2")).toBeTruthy();
  });
});
