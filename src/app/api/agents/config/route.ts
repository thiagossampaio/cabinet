import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { getManagedDataDir } from "@/lib/runtime/runtime-config";

const CONFIG_DIR = path.join(DATA_DIR, ".agents", ".config");
const COMPANY_FILE = path.join(CONFIG_DIR, "company.json");

export interface CompanyConfig {
  exists?: boolean;
  repos_base_dir?: string;
  [key: string]: unknown;
}

const DEFAULT_COMPANY_CONFIG: CompanyConfig = {
  repos_base_dir: "",
};

export async function GET() {
  try {
    const raw = await fs.readFile(COMPANY_FILE, "utf-8");
    const stored = JSON.parse(raw) as CompanyConfig;
    return NextResponse.json({ ...DEFAULT_COMPANY_CONFIG, ...stored });
  } catch {
    return NextResponse.json({
      ...DEFAULT_COMPANY_CONFIG,
      exists: false,
      _defaultReposBaseDir: path.join(getManagedDataDir(), "repos"),
    });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(COMPANY_FILE, JSON.stringify(body, null, 2), "utf-8");

  return NextResponse.json({ ok: true }, { status: 201 });
}
