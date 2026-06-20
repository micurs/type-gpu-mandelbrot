import * as path from "jsr:@std/path";
import * as semver from "@std/semver";

type VersionJson = {
  version: string;
};

type UpdateType = "patch" | "minor" | "major" | "none";

const fileExists = async (path: string) => {
  try {
    await Deno.lstat(path);
    return true;
  } catch {
    return false;
  }
};

const readVersionFile = async (fileName: string): Promise<VersionJson | null> => {
  try {
    return JSON.parse(await Deno.readTextFile(fileName)) as unknown as VersionJson;
  } catch {
    return null;
  }
};

/**
 * Update deno.json and package.json files with new version if greater then
 * the one in the files.
 * @param newVersion - New version to update to (as SemVer)
 * @param dstPath - Path to the project directory
 */
const updateVersion = async (newVersion: semver.SemVer, dstPath: string) => {
  const denoFile = path.join(dstPath, "deno.json");
  const jsrFile = path.join(dstPath, "jsr.json");
  const prjFile = path.join(dstPath, "package.json");
  const newSemver = semver.format(newVersion);

  console.log(`${dstPath}`);

  const denoJson = await readVersionFile(denoFile);
  const jsrJson = await readVersionFile(jsrFile);
  const prjJson = await readVersionFile(prjFile);

  const denoSemver = denoJson ? semver.parse(denoJson.version) : null;
  const jsrSemver = jsrJson ? semver.parse(jsrJson.version) : null;
  const prjSemver = prjJson ? semver.parse(prjJson.version) : null;

  if (denoJson && denoSemver && semver.greaterThan(newVersion, denoSemver)) {
    denoJson.version = newSemver;
    await Deno.writeTextFile(denoFile, JSON.stringify(denoJson, null, 2));
    console.log(`  ✅ ${denoFile}`, ">", newSemver);
  } else {
    console.log(
      `     ${denoFile}`,
      ">",
      `no version update (${denoSemver ? semver.format(denoSemver) : "no file"})`,
    );
  }

  if (jsrJson && jsrSemver && semver.greaterThan(newVersion, jsrSemver)) {
    jsrJson.version = newSemver;
    await Deno.writeTextFile(jsrFile, JSON.stringify(jsrJson, null, 2));
    console.log(`  ✅ ${jsrFile}`, ">", newSemver);
  } else {
    console.log(
      `     ${jsrFile}`,
      ">",
      `no version update (${jsrSemver ? semver.format(jsrSemver) : "no file"})`,
    );
  }

  if (prjJson && prjSemver && semver.greaterThan(newVersion, prjSemver)) {
    prjJson.version = newSemver;
    await Deno.writeTextFile(prjFile, JSON.stringify(prjJson, null, 2));
    console.log(`  ✅ ${prjFile}`, ">", newSemver);
  } else {
    console.log(
      `     ${prjFile}`,
      ">",
      `no version update (${prjSemver ? semver.format(prjSemver) : "no file"})`,
    );
  }
};

const main = async (update: UpdateType) => {
  let mainConfig = await readVersionFile("./deno.json");
  if (!mainConfig) {
    mainConfig = await readVersionFile("./package.json");
  }
  if (!mainConfig) {
    console.error('Could not find a "deno.json" or a "package.json" in the current directory');
    Deno.exit(1);
  }
  const newVersion = semver.parse(mainConfig.version);
  switch (update) {
    case "major":
      newVersion.major++;
      newVersion.minor = 0;
      newVersion.patch = 0;
      break;
    case "minor":
      newVersion.minor++;
      newVersion.patch = 0;
      break;
    case "patch":
      newVersion.patch++;
      break;
    case "none":
      break;
    default:
      console.error(
        `Invalid update type: "${update}"`,
        '\nValid values are: "major", "minor", or "patch"',
      );
      return;
  }
  console.log("Updating Version to:", semver.format(newVersion));

  await updateVersion(newVersion, "./packages/ts-geopro");
  await updateVersion(newVersion, "./demos/cli");
  await updateVersion(newVersion, ".");
};

// Get the first parameter as the update type (no checks yet on valid values)
const update = (Deno.args[0] ?? "none") as UpdateType;

await main(update);
Deno.exit(0);
