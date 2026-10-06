import braces from 'braces';

function nest(depth: number) {
  let pattern = 'a';
  for (let i = 0; i < depth; i++) pattern = `{a,${pattern}}`;
  return pattern;
}

describe('braces nesting limit', () => {
  it('expands the single-level sets used by Tailwind content globs', () => {
    expect(braces('*.{js,ts,jsx,tsx}', { expand: true })).toEqual([
      '*.js',
      '*.ts',
      '*.jsx',
      '*.tsx',
    ]);
  });

  it('stops brace patterns before they can exhaust the call stack', () => {
    expect(() => braces(nest(120))).toThrow(
      /Brace nesting depth \(101\) exceeds max depth \(100\)/
    );
  });
});
