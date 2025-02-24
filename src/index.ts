import fs from 'fs-extra';
import path from 'path';
import { Options as ReadOptions, readPackageSync } from 'read-pkg';
import { NormalizedOutputOptions, OutputBundle, Plugin } from 'rollup';
import { writePackageSync } from 'write-pkg';
import sortPackageJson from 'sort-package-json';
import { PackageJson } from 'type-fest';
import fg from 'fast-glob';

/**
 * オプション
 */
export type CreateDistPackageJsonOptions = {
  /**
   * コンテンツ
   */
  content?:
    | Partial<PackageJson>
    | ((packageJson: PackageJson) => Partial<PackageJson>);

  /**
   * 元のpackage.jsonから引き継ぐ項目
   * デフォルトは`['name', 'version', 'description', 'repository', 'bugs', 'homepage', 'author', 'contributors', 'license', 'type', 'engines', 'keywords']`
   */
  inheritProps?: string[];

  /**
   * 入力元ディレクトリ
   * 未指定の場合はカレントディレクトリ
   */
  inputDir?: string;

  /**
   * ワークスペースの場合
   * パッケージが置かれているディレクトリのパス
   * 未指定の場合は`..`
   */
  packagesDir?: string;

  /**
   * 出力先ディレクトリ
   * 未指定の場合はrollupのoutput設定から取得
   */
  outputDir?: string;

  /**
   * 出力前の加工処理
   */
  processor?: (packageJson: PackageJson) => PackageJson;
};

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

const WORKSPACE_DEPS = /^(?:\*|workspace:.+|portal:.+)$/;
const INHERIT_PROPS = [
  'name',
  'version',
  'description',
  'repository',
  'bugs',
  'homepage',
  'author',
  'contributors',
  'license',
  'type',
  'engines',
  'keywords',
];

/**
 * package.jsonを編集しビルド結果のディレクトリに出力するプラグイン
 */
export default function createDistPackageJson(
  options: CreateDistPackageJsonOptions = {},
): Plugin {
  const {
    content = {},
    inheritProps = INHERIT_PROPS,
    inputDir,
    packagesDir = '..',
    outputDir,
    processor = (pkgJson) => pkgJson,
  } = options;

  return {
    name: 'create-dist-packagejson',
    generateBundle: async (
      outputOptions: NormalizedOutputOptions,
      bundle: OutputBundle,
    ) => {
      // 開発時用のpackage.jsonを取得
      const options: Mutable<ReadOptions> = { normalize: false };
      if (inputDir) {
        options.cwd = inputDir;
      }
      const orgPackageJson = readPackageSync(options);
      // ビルドされたパッケージ用のpackage.jsonのベースを取得
      const packageJson =
        typeof content === 'function'
          ? content(orgPackageJson)
          : { ...content };

      // バンドルされるモジュール内でimportしているものを全て取得
      const imports = Object.values(bundle).reduce((result, chunk) => {
        if ('imports' in chunk) {
          chunk.imports.forEach((item) => {
            result.add(item);
          });
        }
        return result;
      }, new Set<string>());

      // 全てのimportの中から、開発時用のpackage.jsonのdependencies,devDependenciesに含まれる外部のパッケージを取得
      const dependencies = _getExternalDependencies(imports, {
        ...orgPackageJson.devDependencies,
        ...orgPackageJson.dependencies,
      });

      if (packageJson.dependencies) {
        // baseのdependenciesとマージ
        Object.assign(dependencies, packageJson.dependencies);
      }

      // ワークスペース内のdependenciesは実際のバージョンに置き換え
      let versions;
      for (const pkg in dependencies) {
        if (WORKSPACE_DEPS.test(dependencies[pkg])) {
          if (!versions) {
            versions = _getPckageVersions(packagesDir);
          }
          const version = versions[pkg];
          if (version) {
            dependencies[pkg] = version;
          }
        }
      }

      // dependenciesを出力に反映
      packageJson.dependencies = dependencies;

      // 指定のプロパティが未設定で、開発時用のpackage.jsonにあれば設定
      if (inheritProps) {
        for (const prop of inheritProps) {
          if (!packageJson[prop] && orgPackageJson[prop]) {
            packageJson[prop] = orgPackageJson[prop];
          }
        }
      }

      // ビルド先に出力
      const outputPath =
        outputDir || outputOptions.dir || path.dirname(outputOptions.file);
      writePackageSync(outputPath, sortPackageJson(processor(packageJson)), {
        indent: 2,
      });
    },
  };
}

/**
 * ワークスペース内のパッケージのバージョンを取得する
 * @param packagesDir 他のパッケージが配置されているディレクトリの相対パス
 * @return パッケージ名をキー、バージョンを値としたレコード
 */
function _getPckageVersions(packagesDir: string) {
  const itemPaths = fg.globSync([
    `${packagesDir}/**/package.json`,
    `!${packagesDir}/**/node_modules/**/package.json`,
  ]);
  const versions: Record<string, string> = {};
  for (const itemPath of itemPaths) {
    const packageJson = fs.readJsonSync(itemPath);
    versions[packageJson.name] = packageJson.version;
  }
  return versions;
}

/**
 * 各ソースコードのimportの情報を基に\
 * 外部パッケージのみのdependenciesを取得する
 * @param imports importの情報
 * @param orgGependencies 元のpackage.jsonのdependencies
 * @return 外部パッケージのみのdependencies
 */
function _getExternalDependencies(
  imports: Set<string>,
  orgGependencies: Record<string, string>,
) {
  const dependencies: Record<string, string> = {};
  imports.forEach((item) => {
    if (!item.endsWith('.js')) {
      const tokens = item.split(/[/\\]/);
      for (let i = Math.min(tokens.length, 2); 0 < i; i--) {
        const pkg = tokens.slice(0, i).join('/');
        if (pkg in orgGependencies) {
          dependencies[pkg] = orgGependencies[pkg];
          break;
        }
      }
    }
  });
  return dependencies;
}
