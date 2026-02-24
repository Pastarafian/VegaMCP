/**
 * Git Tools — Interact with Git repositories via CLI
 * Inspired by the official Anthropic MCP git reference server
 */

import { execSync } from 'child_process';
import path from 'path';

function result(data: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function git(args: string, cwd?: string): string {
  const workDir = cwd || process.env.WORKSPACE_ROOT || process.cwd();
  try {
    return execSync(`git ${args}`, {
      cwd: workDir,
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024,
    }).trim();
  } catch (err: any) {
    throw new Error(err.stderr?.trim() || err.message);
  }
}

export const gitToolsSchema = {
  name: 'vegamcp_git',
  description: 'Git version control operations — status, log, diff, commit, branch, checkout, add, blame, stash, tag. Actions: status, log, diff, commit, branch_list, branch_create, checkout, add, blame, stash, tag, remote, reset, show.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string' as const,
        enum: ['status', 'log', 'diff', 'commit', 'branch_list', 'branch_create', 'checkout', 'add', 'blame', 'stash', 'tag', 'remote', 'reset', 'show'] as const,
        description: 'Git action to perform',
      },
      path: { type: 'string' as const, description: 'File path (for add, blame, diff)' },
      message: { type: 'string' as const, description: 'Commit message (for commit)' },
      branch: { type: 'string' as const, description: 'Branch name (for branch_create, checkout)' },
      limit: { type: 'number' as const, description: 'Max entries to return (for log, default 20)' },
      ref: { type: 'string' as const, description: 'Git ref — commit hash, branch, or tag (for show, diff, reset)' },
      cwd: { type: 'string' as const, description: 'Working directory (defaults to WORKSPACE_ROOT)' },
      stash_action: { type: 'string' as const, description: 'Stash sub-action: push, pop, list, drop' },
    },
    required: ['action'] as const,
  },
};

export async function handleGitTools(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const cwd = args.cwd;

  try {
    switch (args.action) {

      case 'status': {
        const output = git('status --porcelain', cwd);
        const branch = git('branch --show-current', cwd);
        const lines = output ? output.split('\n') : [];
        const staged = lines.filter(l => l[0] !== ' ' && l[0] !== '?').length;
        const modified = lines.filter(l => l[1] === 'M').length;
        const untracked = lines.filter(l => l.startsWith('??')).length;
        return result({
          success: true,
          branch,
          staged,
          modified,
          untracked,
          totalChanges: lines.length,
          files: lines.map(l => ({
            status: l.substring(0, 2).trim(),
            file: l.substring(3),
          })),
        });
      }

      case 'log': {
        const limit = args.limit || 20;
        const output = git(`log --oneline --no-decorate -n ${limit} --format="%H|%an|%ae|%ar|%s"`, cwd);
        const entries = output ? output.split('\n').map(line => {
          const [hash, author, email, date, ...msgParts] = line.split('|');
          return { hash, author, email, date, message: msgParts.join('|') };
        }) : [];
        return result({ success: true, entries, count: entries.length });
      }

      case 'diff': {
        let cmd = 'diff';
        if (args.ref) cmd += ` ${args.ref}`;
        if (args.path) cmd += ` -- "${args.path}"`;
        const output = git(cmd, cwd);
        return result({
          success: true,
          diff: output || '(no changes)',
          linesChanged: output ? output.split('\n').length : 0,
        });
      }

      case 'commit': {
        if (!args.message) throw new Error('message is required for commit');
        const output = git(`commit -m "${args.message.replace(/"/g, '\\"')}"`, cwd);
        return result({ success: true, output });
      }

      case 'branch_list': {
        const output = git('branch -a --format="%(refname:short)|%(objectname:short)|%(committerdate:relative)|%(subject)"', cwd);
        const branches = output ? output.split('\n').map(line => {
          const [name, hash, date, ...subj] = line.split('|');
          return { name, hash, date, subject: subj.join('|') };
        }) : [];
        const current = git('branch --show-current', cwd);
        return result({ success: true, current, branches, count: branches.length });
      }

      case 'branch_create': {
        if (!args.branch) throw new Error('branch name is required');
        const output = git(`branch "${args.branch}"`, cwd);
        return result({ success: true, created: args.branch, output });
      }

      case 'checkout': {
        if (!args.branch) throw new Error('branch name is required');
        const output = git(`checkout "${args.branch}"`, cwd);
        return result({ success: true, switched_to: args.branch, output });
      }

      case 'add': {
        const target = args.path || '.';
        const output = git(`add "${target}"`, cwd);
        return result({ success: true, added: target, output: output || 'staged' });
      }

      case 'blame': {
        if (!args.path) throw new Error('path is required for blame');
        const output = git(`blame --porcelain "${args.path}"`, cwd);
        return result({ success: true, path: args.path, blame: output.slice(0, 10000) });
      }

      case 'stash': {
        const sub = args.stash_action || 'list';
        const output = git(`stash ${sub}`, cwd);
        return result({ success: true, action: sub, output: output || '(empty)' });
      }

      case 'tag': {
        const output = git('tag -l --sort=-v:refname', cwd);
        return result({
          success: true,
          tags: output ? output.split('\n') : [],
          count: output ? output.split('\n').length : 0,
        });
      }

      case 'remote': {
        const output = git('remote -v', cwd);
        return result({ success: true, remotes: output || '(none)' });
      }

      case 'reset': {
        const ref = args.ref || 'HEAD';
        const output = git(`reset ${ref}`, cwd);
        return result({ success: true, reset_to: ref, output });
      }

      case 'show': {
        const ref = args.ref || 'HEAD';
        const output = git(`show ${ref} --stat --format="%H%n%an%n%ae%n%ar%n%s%n%b"`, cwd);
        return result({ success: true, ref, output: output.slice(0, 10000) });
      }

      default:
        return result({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    return result({ success: false, error: err.message });
  }
}
