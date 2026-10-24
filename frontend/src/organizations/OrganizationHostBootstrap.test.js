import { act, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ resolveHostOrganization: vi.fn() }));

vi.mock("../app/AppRouter", () => ({
  AppRouter: ({ hostResolution }) => hostResolution.status,
}));
vi.mock("./resolveOrganization", () => ({
  resolveHostOrganization: state.resolveHostOrganization,
}));

import { OrganizationHostBootstrap } from "./OrganizationHostBootstrap";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OrganizationHostBootstrap", () => {
  it("renders immediately and applies host resolution asynchronously", async () => {
    let resolveRequest;
    state.resolveHostOrganization.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    render(createElement(
      MemoryRouter,
      null,
      createElement(OrganizationHostBootstrap),
    ));

    expect(screen.getByText("pending")).toBeTruthy();
    await waitFor(() => expect(state.resolveHostOrganization).toHaveBeenCalledOnce());

    await act(async () => {
      resolveRequest({ status: "resolved", organization: { slug: "demo" } });
    });

    expect(screen.getByText("resolved")).toBeTruthy();
  });
});
