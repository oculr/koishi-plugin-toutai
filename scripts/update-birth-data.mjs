import { createReadStream } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const unDataUrl =
  "https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_Demographic_Indicators_Medium.csv.gz";
const unDataPath = resolve(
  process.argv[2] ||
    resolve(
      root,
      "node_modules/.cache/WPP2024_Demographic_Indicators_Medium.csv.gz",
    ),
);
const dataYear = 2025;
// 国家统计局《中华人民共和国2025年国民经济和社会发展统计公报》：792 万。
const mainlandBirths = 7_920_000;
const categories = ["town", "city", "countryside"];
const birthOrders = ["one", "two", "three", "four", "fivePlus"];
const genders = ["male", "female"];
const specialRegions = new Map([
  ["xiang_gang", "HK"],
  ["ao_men", "MO"],
  ["tai_wan", "TW"],
]);
const worldIsoGroups = new Map([
  ["XC", ["GG", "JE"]],
  ["CS", ["CZ"]],
  ["XO", ["XK"]],
]);

function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

async function readUnData() {
  const rows = new Map();
  const input = createReadStream(unDataPath).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  let headers;

  for await (const line of lines) {
    if (!headers) {
      headers = parseCsvLine(line.replace(/^\uFEFF/, ""));
      continue;
    }

    const fields = parseCsvLine(line);
    const row = Object.fromEntries(
      headers.map((header, index) => [header, fields[index]]),
    );
    if (
      row.Variant !== "Medium" ||
      Number(row.Time) !== dataYear ||
      !row.ISO2_code
    ) {
      continue;
    }

    rows.set(row.ISO2_code, {
      location: row.Location,
      populationThousands: Number(row.TPopulation1July),
      birthsThousands: Number(row.Births),
      crudeBirthRate: Number(row.CBR),
      sexRatioAtBirth: Number(row.SRB),
    });
  }

  return rows;
}

function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}

function allocateByLargestRemainder(values, target) {
  const sourceTotal = values.reduce((sum, value) => sum + value, 0);
  const exact = values.map((value) => (value * target) / sourceTotal);
  const allocated = exact.map(Math.floor);
  let remainder = target - allocated.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - allocated[index] }))
    .sort((left, right) => right.fraction - left.fraction);

  for (let index = 0; index < remainder; index += 1) {
    allocated[order[index].index] += 1;
  }
  return allocated;
}

function getDetailedCells(regions, predicate) {
  const cells = [];
  for (const region of regions) {
    if (region.name === "national" || !predicate(region)) continue;
    for (const category of categories) {
      for (const order of birthOrders) {
        for (const gender of genders) {
          cells.push({ region, category, order, gender });
        }
      }
    }
  }
  return cells;
}

function getWorldSource(iso2, country, unRows) {
  const sourceRows = (worldIsoGroups.get(iso2) || [iso2])
    .map((code) => unRows.get(code))
    .filter(Boolean);
  if (sourceRows.length === 0) return null;
  if (sourceRows.length === 1) return sourceRows[0];

  const populationThousands = sourceRows.reduce(
    (sum, source) => sum + source.populationThousands,
    0,
  );
  const birthsThousands = sourceRows.reduce(
    (sum, source) => sum + source.birthsThousands,
    0,
  );
  return {
    location: country.nameEn,
    populationThousands,
    birthsThousands,
    crudeBirthRate: (birthsThousands / populationThousands) * 1000,
    sexRatioAtBirth:
      sourceRows.reduce(
        (sum, source) => sum + source.sexRatioAtBirth * source.birthsThousands,
        0,
      ) / birthsThousands,
  };
}

function updateChinaData(detailedData, unRows) {
  const mainlandCells = getDetailedCells(
    detailedData,
    (region) => !specialRegions.has(region.name),
  );
  const scaled = allocateByLargestRemainder(
    mainlandCells.map(
      ({ region, category, order, gender }) => region[category][order][gender],
    ),
    mainlandBirths / 10,
  );
  mainlandCells.forEach(({ region, category, order, gender }, index) => {
    region[category][order][gender] = scaled[index];
  });

  const nationalRegion = detailedData.find(
    (region) => region.name === "national",
  );
  if (!nationalRegion)
    throw new Error("Detailed China data has no national row");
  for (const category of categories) {
    for (const order of birthOrders) {
      for (const gender of genders) {
        nationalRegion[category][order][gender] = detailedData
          .filter(
            (region) =>
              region.name !== "national" && !specialRegions.has(region.name),
          )
          .reduce((sum, region) => sum + region[category][order][gender], 0);
      }
    }
  }
  const nationalSampleTotal = categories.reduce(
    (categoryTotal, category) =>
      categoryTotal +
      birthOrders.reduce(
        (orderTotal, order) =>
          orderTotal +
          genders.reduce(
            (genderTotal, gender) =>
              genderTotal + nationalRegion[category][order][gender],
            0,
          ),
        0,
      ),
    0,
  );
  if (nationalSampleTotal * 10 !== mainlandBirths) {
    throw new Error("Scaled China detail does not match the NBS total");
  }

  for (const region of detailedData) {
    const iso2 = specialRegions.get(region.name);
    if (!iso2) continue;
    const source = unRows.get(iso2);
    if (!source) throw new Error(`UN data is missing ${iso2}`);

    for (const category of categories) {
      for (const order of birthOrders) {
        for (const gender of genders) {
          region[category][order][gender] = 0;
        }
      }
    }

    const total = Math.round(source.birthsThousands * 1000);
    const male = Math.round(
      (total * source.sexRatioAtBirth) / (100 + source.sexRatioAtBirth),
    );
    region.city.one.male = male;
    region.city.one.female = total - male;
  }

  const summary = detailedData
    .filter((region) => region.name !== "national")
    .map((region) => {
      let male = 0;
      let female = 0;
      const multiplier = specialRegions.has(region.name) ? 1 : 10;
      for (const category of categories) {
        for (const order of birthOrders) {
          male += region[category][order].male * multiplier;
          female += region[category][order].female * multiplier;
        }
      }
      return {
        id: region.name,
        name: region.displayName,
        total: male + female,
        male,
        female,
      };
    });
  const mainlandSummary = summary.filter(
    (region) => !specialRegions.has(region.id),
  );
  const nationalMale = mainlandSummary.reduce(
    (sum, region) => sum + region.male,
    0,
  );
  const nationalFemale = mainlandSummary.reduce(
    (sum, region) => sum + region.female,
    0,
  );

  return {
    region: [
      {
        id: "national",
        name: "全国",
        total: nationalMale + nationalFemale,
        male: nationalMale,
        female: nationalFemale,
      },
      ...summary,
    ],
  };
}

function updateWorldData(worldData, unRows) {
  const rows = [];
  const unmatched = [];

  for (const [iso2, country] of Object.entries(worldData)) {
    const source = getWorldSource(iso2, country, unRows);
    if (!source || !Number.isFinite(source.birthsThousands)) {
      unmatched.push(`${iso2} (${country.nameEn})`);
      continue;
    }

    const births = Math.max(0, Math.round(source.birthsThousands * 1000));
    country.population = round(source.populationThousands, 3);
    country.birthRate = round(source.crudeBirthRate, 3);
    rows.push({
      country: source.location,
      name: country.nameCn,
      year: dataYear,
      population: round(source.populationThousands / 1000, 6),
      birthRate: round(source.crudeBirthRate, 6),
      births,
      birthRatePercentage: 0,
    });
  }

  const totalBirths = rows.reduce((sum, row) => sum + row.births, 0);
  for (const row of rows) {
    row.birthRatePercentage = row.births / totalBirths;
  }
  const probabilityTotal = rows.reduce(
    (sum, row) => sum + row.birthRatePercentage,
    0,
  );
  if (Math.abs(probabilityTotal - 1) > 1e-12) {
    throw new Error(`World birth probabilities add up to ${probabilityTotal}`);
  }

  return { rows, unmatched, totalBirths };
}

try {
  await access(unDataPath);
} catch {
  throw new Error(
    `UN WPP source file not found. Download ${unDataUrl} to ${unDataPath}`,
  );
}

const unRows = await readUnData();
const detailedPath = resolve(root, "src/assets/birthrateDetailed.json");
const summaryPath = resolve(root, "src/assets/birthrate.json");
const worldPath = resolve(root, "src/assets/worldData.json");
const worldBirthratePath = resolve(root, "src/assets/worldBirthrate.json");
const detailedData = JSON.parse(await readFile(detailedPath, "utf8"));
const worldData = JSON.parse(await readFile(worldPath, "utf8"));

const chinaSummary = updateChinaData(detailedData, unRows);
const worldResult = updateWorldData(worldData, unRows);

await Promise.all([
  writeFile(detailedPath, `${JSON.stringify(detailedData, null, 2)}\n`),
  writeFile(summaryPath, `${JSON.stringify(chinaSummary, null, 2)}\n`),
  writeFile(worldPath, `${JSON.stringify(worldData, null, 2)}\n`),
  writeFile(
    worldBirthratePath,
    `${JSON.stringify(worldResult.rows, null, 2)}\n`,
  ),
]);

console.log(`UN WPP rows loaded: ${unRows.size}`);
console.log(`World locations updated: ${worldResult.rows.length}`);
console.log(`World annual births represented: ${worldResult.totalBirths}`);
console.log(
  `Unmatched map locations: ${worldResult.unmatched.join(", ") || "none"}`,
);
console.log(`Mainland China annual births: ${mainlandBirths}`);
