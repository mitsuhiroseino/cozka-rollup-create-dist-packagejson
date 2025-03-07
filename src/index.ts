import fg from 'fast-glob';
import fs from 'fs-extra';
import path from 'path';
import { NormalizedOutputOptions, OutputBundle, Plugin } from 'rollup';
import sortPackageJson from 'sort-package-json';
import { PackageJson } from 'type-fest';

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
const DEPENDENCIES_PROP_NAMES = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
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
    inputDir = process.cwd(),
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
      const orgPackageJson = fs.readJsonSync(
        path.join(inputDir, 'package.json'),
        {
          encoding: 'utf8',
        },
      );
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

      // dependencies関連の項目を処理
      for (const propName of DEPENDENCIES_PROP_NAMES) {
        const dependencies = _createDependencies(
          orgPackageJson[propName] as Record<string, string>,
          packageJson[propName] as Record<string, string>,
          imports,
          packagesDir,
        );
        if (dependencies) {
          packageJson[propName] = dependencies;
        } else {
          delete packageJson[propName];
        }
      }

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
      fs.writeJsonSync(
        path.join(outputPath, 'package.json'),
        sortPackageJson(processor(packageJson)),
        {
          encoding: 'utf8',
          spaces: 2,
        },
      );
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
 * パッケージの依存関係を定義した項目を作成する
 * @param orgDependencies 元のpackage.jsonの依存関係
 * @param userDependencies ユーザーの指定した依存関係
 * @param imports 全ソースのimport情報
 * @param packagesDir ワークスページのパッケージの保存先ディレクトリ
 * @returns 依存関係
 */
function _createDependencies(
  orgDependencies: Record<string, string>,
  userDependencies: Record<string, string>,
  imports: Set<string>,
  packagesDir: string,
) {
  // 全てのimportの中から、開発時用のpackage.jsonのdependenciesに含まれる外部のパッケージを取得
  const dependencies = orgDependencies
    ? _getExternalDependencies(imports, orgDependencies)
    : {};

  if (userDependencies) {
    // baseのdependenciesとマージ
    Object.assign(dependencies, userDependencies);
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

  // dependenciesを返す
  if (Object.keys(dependencies).length) {
    return dependencies;
  } else {
    return undefined;
  }
}

/**
 * 各ソースコードのimportの情報を基に\
 * 外部パッケージのみのdependenciesを取得する
 * @param imports importの情報
 * @param orgDependencies 元のpackage.jsonのdependencies
 * @return 外部パッケージのみのdependencies
 */
function _getExternalDependencies(
  imports: Set<string>,
  orgDependencies: Record<string, string>,
) {
  const dependencies: Record<string, string> = {};
  imports.forEach((item) => {
    if (!item.endsWith('.js')) {
      const tokens = item.split(/[/\\]/);
      for (let i = Math.min(tokens.length, 2); 0 < i; i--) {
        const pkg = tokens.slice(0, i).join('/');
        if (pkg in orgDependencies) {
          dependencies[pkg] = orgDependencies[pkg];
          break;
        }
      }
    }
  });
  return dependencies;
}
