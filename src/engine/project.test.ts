import { expect, it } from 'vitest';
import { ProjectFormatError, parseProject, serializeProject } from './project';
import type { Project } from './types';

const minimal: Project = {
  version: 1,
  settings: {
    resolution: '1080p',
    fps: 30,
    aspect: '16:9',
    styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
  },
  keyframes: [],
  elements: [],
};

it('round-trips a project through serialize/parse', () => {
  expect(parseProject(serializeProject(minimal))).toEqual(minimal);
});

it('rejects unknown versions with a message naming the version', () => {
  const v2 = JSON.stringify({ ...minimal, version: 2 });
  expect(() => parseProject(v2)).toThrow(/version/i);
});

it('rejects non-JSON input', () => {
  expect(() => parseProject('not json')).toThrow(ProjectFormatError);
});

it('rejects JSON that is not a project', () => {
  expect(() => parseProject('{"version":1}')).toThrow(ProjectFormatError);
});
