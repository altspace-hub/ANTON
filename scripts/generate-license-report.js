import checker from 'license-checker';
import fs from 'fs';

checker.init(
  {
    start: process.cwd(),
    production: true,
    json: false,
    csv: true,
    customFormat: {
      name: '',
      version: '',
      license: '',
      repository: '',
    },
  },
  (err, packages) => {
    if (err) {
      console.error('License check failed:', err);
      process.exit(1);
    }

    // Generate CSV report
    const csvRows = [];
    csvRows.push('Package,Version,License,Repository');

    Object.entries(packages).forEach(([name, details]) => {
      const pkgName = name.split('@')[0];
      const version = details.version || 'unknown';
      const license = details.licenses || 'unknown';
      const repo = details.repository || 'N/A';
      csvRows.push(`"${pkgName}","${version}","${license}","${repo}"`);
    });

    fs.writeFileSync('LICENSES.csv', csvRows.join('\n'));
    console.log('✅ License report generated: LICENSES.csv');

    // Check for problematic licenses
    const problematic = [];
    const allowed = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC0-1.0', 'Unlicense', '0BSD', 'Python-2.0'];

    Object.entries(packages).forEach(([name, details]) => {
      const license = details.licenses;
      if (license && !allowed.some(l => license.includes(l))) {
        problematic.push({ name, license });
      }
    });

    if (problematic.length > 0) {
      console.warn('\n⚠️  Packages with non-standard licenses:');
      problematic.forEach(p => console.warn(`  - ${p.name}: ${p.license}`));
      console.warn('\nReview these manually and document any exceptions in EXCEPTIONS.md\n');
    }
  }
);
