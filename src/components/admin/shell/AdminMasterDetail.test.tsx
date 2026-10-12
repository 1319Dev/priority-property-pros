import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { mockAdminViewport } from "../../../test/adminViewport";
import { AdminMasterDetail } from "./AdminMasterDetail";
import { useAdminDesktop } from "./useAdminDesktop";

function Harness({ showList }: { showList: boolean }) {
  const desktop = useAdminDesktop();
  return (
    <AdminMasterDetail
      desktop={desktop}
      showList={showList}
      list={<h2>Directory list</h2>}
      detail={<h2>Record detail</h2>}
      listLabel="Directory"
      detailLabel="Record"
    />
  );
}

describe("admin master detail", () => {
  afterEach(() => {
    mockAdminViewport(390);
  });

  it("shows only the list on a phone", () => {
    mockAdminViewport(390);
    render(<Harness showList />);
    expect(screen.getByRole("heading", { name: "Directory list" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Record detail" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Record" })).not.toBeInTheDocument();
  });

  it("shows only the detail on a phone when a record is open", () => {
    mockAdminViewport(390);
    render(<Harness showList={false} />);
    expect(screen.getByRole("heading", { name: "Record detail" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Directory list" })).not.toBeInTheDocument();
  });

  it("keeps the list and a sticky detail pane on a desktop width", () => {
    mockAdminViewport(1280);
    render(<Harness showList={false} />);
    expect(screen.getByRole("region", { name: "Directory" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Record" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Directory list" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Record detail" })).toBeInTheDocument();
  });
});
