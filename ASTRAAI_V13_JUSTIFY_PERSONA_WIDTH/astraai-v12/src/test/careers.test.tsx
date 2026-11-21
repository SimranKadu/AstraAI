import path from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAREER_GUIDE, CAREER_ROLES, roleDetail } from "@/data/careers";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  Panel: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <section>{title && <h2>{title}</h2>}{children}</section>
  ),
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const norm = (text: string) => text.replace(/\s+/g, " ").replace(/[‘’]/g, "'").trim();

describe("Career Hub data comes from the ISRO career guide", () => {
  it("has the 13 roles of the guide and nothing from the old page", () => {
    expect(CAREER_ROLES).toHaveLength(13);
    expect(new Set(CAREER_ROLES.map((r) => r.id)).size).toBe(13);
    const titles = CAREER_ROLES.map((r) => r.title).join(" | ");
    for (const old of ["AI/ML Engineer", "Space Data Analyst", "Orbital Mechanics Engineer", "Spacecraft Systems Engineer"])
      expect(titles).not.toContain(old);
  });

  it("copies the role descriptions, study routes and exam text word for word from the document", async () => {
    const mammoth = (await import("mammoth")).default;
    const { value } = await mammoth.extractRawText({
      path: path.resolve(process.cwd(), "data/careers/ISRO_Career_Guide_Jobs_Exams_Resources.docx"),
    });
    const doc = norm(value);
    for (const role of CAREER_ROLES) {
      expect(doc, `${role.id} work`).toContain(norm(role.work));
      expect(doc, `${role.id} study`).toContain(norm(role.study));
      if (role.path) expect(doc, `${role.id} path`).toContain(norm(role.path));
    }
    for (const key of ["sc", "research", "technical", "admin"])
      for (const point of CAREER_GUIDE.examRoutes[key]!.points) expect(doc, point.slice(0, 40)).toContain(norm(point));
    for (const subject of Object.values(CAREER_GUIDE.subjects)) expect(doc).toContain(norm(subject.topics));
    for (const item of CAREER_GUIDE.plan) expect(doc).toContain(norm(item.focus));
    for (const step of CAREER_GUIDE.prepSteps) expect(doc).toContain(norm(step));
    for (const resource of Object.values(CAREER_GUIDE.resources)) expect(doc).toContain(resource.url);
  });

  it("gives every role complete, linked detail", () => {
    for (const role of CAREER_ROLES) {
      const detail = roleDetail(role);
      expect(role.short.length, role.id).toBeLessThanOrEqual(90);
      expect(detail.examRoutes.length, role.id).toBe(role.exams.length);
      expect(detail.subjects.length, role.id).toBe(role.subjects.length);
      expect(detail.resources.length, role.id).toBe(role.resources.length);
      for (const r of detail.resources) expect(r.url).toMatch(/^https:\/\//);
    }
  });
});

describe("Career Hub page", () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
  });
  afterEach(() => container.remove());

  const click = async (el: Element | undefined) => {
    expect(el).toBeDefined();
    await act(async () => (el as HTMLElement).click());
  };
  const button = (re: RegExp) => [...container.querySelectorAll("button")].find((b) => re.test(b.textContent ?? ""));
  const mount = async () => {
    const { Route } = await import("@/routes/_authenticated/careers");
    const root = createRoot(container);
    const Page = Route.options.component as () => React.ReactNode;
    await act(async () => root.render(<Page />));
    return root;
  };

  it("lists roles with only a short description and related studies", async () => {
    const root = await mount();
    expect(container.querySelectorAll("h2")).toHaveLength(13);
    expect(container.textContent).toContain("Design and test launch vehicles, propulsion hardware and spacecraft structures.");
    expect(container.textContent).toContain("Related studies");
    for (const heading of ["Exams and selection", "Suggested books", "Show roadmap"]) expect(container.textContent).not.toContain(heading);
    await act(async () => root.unmount());
  });

  it("filters roles by area", async () => {
    const root = await mount();
    await click(button(/^Technical and trade$/));
    expect([...container.querySelectorAll("h2")].map((h) => h.textContent)).toEqual(["Technical Assistant", "Technician-B / Draughtsman"]);
    await click(button(/^All$/));
    expect(container.querySelectorAll("h2")).toHaveLength(13);
    await act(async () => root.unmount());
  });

  it("opens full detail with education, exams, books and resources, and shows the roadmap only when asked", async () => {
    const root = await mount();
    await click(button(/Scientist\/Engineer, Mechanical\/Aerospace/));
    for (const heading of ["About this role", "Education needed", "Exams and selection", "Subjects and books", "Study resources"])
      expect(container.textContent, heading).toContain(heading);
    expect(container.textContent).toContain("Rocket Propulsion Elements");
    expect(container.textContent).toContain("George P. Sutton and Oscar Biblarz");
    expect(container.textContent).toContain("Do not assume GATE is compulsory");
    expect(container.querySelector('a[href="https://gate2026.iitg.ac.in/"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Education path"]')?.textContent).toContain("B.E./B.Tech Mechanical or Aerospace");
    // roadmap is hidden until asked for
    expect(container.textContent).not.toContain("Month 1");
    await click(button(/Show roadmap/));
    for (let m = 1; m <= 6; m++) expect(container.textContent).toContain(`Month ${m}`);
    expect(container.textContent).toContain("Prepare for selection");
    await click(button(/^Hide$/));
    expect(container.textContent).not.toContain("Month 1");
    await click(button(/All roles/));
    expect(container.querySelectorAll("h2")).toHaveLength(13);
    await act(async () => root.unmount());
  });

  it("does not crash when the browser's scrollIntoView returns a value (React: 'destroy is not a function')", async () => {
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = (() => ({ unexpected: true })) as unknown as typeof original;
    try {
      const root = await mount();
      await click(button(/Scientist\/Engineer, Mechanical\/Aerospace/));
      await click(button(/Show roadmap/));
      expect(container.textContent).toContain("Month 6");
      await act(async () => root.unmount());
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("handles roles that have no book list", async () => {
    const root = await mount();
    await click(button(/Administrative \/ Accounts/));
    expect(container.textContent).toContain("Exams and selection");
    expect(container.textContent).not.toContain("Suggested books");
    expect(container.textContent).toContain("The guide gives no subject list for these posts");
    await act(async () => root.unmount());
  });
});
