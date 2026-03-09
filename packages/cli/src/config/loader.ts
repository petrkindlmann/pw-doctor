import { cosmiconfig } from 'cosmiconfig';
import { ConfigSchema } from '@pw-doctor/shared';
import { DEFAULT_CONFIG } from './defaults.js';
import type { PwDoctorConfig } from '@pw-doctor/shared';

export async function loadConfig(searchFrom: string): Promise<PwDoctorConfig> {
  const explorer = cosmiconfig('pw-doctor', {
    // SECURITY [C1.1]: Only load static formats. No TypeScript/JS evaluation.
    searchPlaces: [
      '.pw-doctor.config.json',
      '.pw-doctor.config.yaml',
      '.pw-doctor.config.yml',
      '.pw-doctorrc.json',
      '.pw-doctorrc.yaml',
      '.pw-doctorrc.yml',
      'package.json',
    ],
    // No loaders for .ts or .js — intentionally omitted
  });

  const result = await explorer.search(searchFrom);

  if (!result || result.isEmpty) {
    return DEFAULT_CONFIG;
  }

  // Merge loaded config with defaults, then validate
  const merged = deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    result.config,
  );
  const parsed = ConfigSchema.parse(merged);

  return parsed as PwDoctorConfig;
}

function deepMerge<T extends Record<string, unknown>>(
  defaults: T,
  overrides: Record<string, unknown>,
): T {
  const result = { ...defaults };

  for (const key of Object.keys(overrides)) {
    const defaultVal = (defaults as Record<string, unknown>)[key];
    const overrideVal = overrides[key];

    if (
      typeof defaultVal === 'object' &&
      defaultVal !== null &&
      !Array.isArray(defaultVal) &&
      typeof overrideVal === 'object' &&
      overrideVal !== null &&
      !Array.isArray(overrideVal)
    ) {
      (result as Record<string, unknown>)[key] = deepMerge(
        defaultVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      );
    } else {
      (result as Record<string, unknown>)[key] = overrideVal;
    }
  }

  return result;
}
