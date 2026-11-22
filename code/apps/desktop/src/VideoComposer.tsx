/**
 * 新建视频：标题 / 视频文件 / 描述 / 封面（可选 · ffmpeg 首帧）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { useRef, useState, type ReactNode } from 'react';
import type { EngineClient } from './api';

const VIDEO_ACCEPT = '.mp4,.mov,.avi,.mkv,.flv,video/mp4,video/quicktime';

/**
 * 新建视频表单
 *
 * @param props 引擎与回调
 * @returns JSX
 */
export function VideoComposer(props: {
  client: EngineClient | null;
  ffmpegAvailable?: boolean;
  onCreated: (contentId: string) => void;
  onCancel: () => void;
  onError?: (message: string) => void;
}): ReactNode {
  const { client, ffmpegAvailable, onCreated, onCancel, onError } = props;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [videoName, setVideoName] = useState('');
  const [videoPath, setVideoPath] = useState('');
  const [videoFilename, setVideoFilename] = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  const [coverPath, setCoverPath] = useState('');
  const [uploadRatio, setUploadRatio] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const videoRef = useRef<HTMLInputElement | null>(null);
  const coverRef = useRef<HTMLInputElement | null>(null);

  /**
   * 选择并分片上传视频
   *
   * @param file 视频文件
   */
  const onPickVideo = async (file: File): Promise<void> => {
    if (!client) {
      onError?.('请先连接引擎');
      return;
    }
    setBusy(true);
    setStatus('正在上传视频…');
    setUploadRatio(0);
    setVideoName(file.name);
    setCoverPreview('');
    setCoverPath('');
    try {
      const saved = await client.uploadVideoFile(file, (r) => {
        setUploadRatio(r);
      });
      setVideoPath(saved.path);
      setVideoFilename(saved.filename);
      setStatus('视频已入库');
      // 尝试自动抽首帧
      try {
        setStatus('正在抽取封面（ffmpeg）…');
        const cover = await client.extractVideoCover({
          videoFilename: saved.filename,
        });
        setCoverPath(cover.path);
        setCoverPreview(client.assetUrl(cover.filename));
        setStatus('已自动使用视频首帧作为封面');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus(msg.includes('ffmpeg') ? msg : `封面未自动生成：${msg}`);
      }
    } catch (err) {
      setVideoName('');
      setVideoPath('');
      setVideoFilename('');
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setUploadRatio(0);
    }
  };

  /**
   * 本地选择封面图
   *
   * @param file 图片
   */
  const onPickCover = async (file: File): Promise<void> => {
    if (!client) {
      onError?.('请先连接引擎');
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const saved = await client.uploadAsset({
        mime: file.type || 'image/png',
        dataBase64: dataUrl,
        filename: file.name || 'cover.png',
      });
      setCoverPath(saved.path);
      setCoverPreview(client.assetUrl(saved.filename));
      setStatus('已使用本地封面');
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  /**
   * 创建视频内容
   */
  const onSubmit = async (): Promise<void> => {
    if (!client) {
      onError?.('请先连接引擎');
      return;
    }
    const t = title.trim();
    if (!t) {
      onError?.('请填写视频标题');
      return;
    }
    if (!videoPath && !videoFilename) {
      onError?.('请先上传视频文件');
      return;
    }
    setBusy(true);
    try {
      const assets = [videoPath || videoFilename];
      if (coverPath) {
        assets.push(coverPath);
      }
      const res = await client.createContent({
        title: t,
        markdown: description,
        assets,
        contentType: 'video',
      });
      onCreated(res.content.id);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="video-composer">
      <header className="vc-head">
        <span className="vc-badge" aria-hidden>
          ▷
        </span>
        <h2>新建视频</h2>
      </header>

      <section className="vc-step">
        <div className="vc-step-label">
          <span className="vc-num">1</span>
          标题
        </div>
        <input
          className="vc-input"
          placeholder="输入视频标题"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
        />
      </section>

      <section className="vc-step">
        <div className="vc-step-label">
          <span className="vc-num">2</span>
          视频
        </div>
        <button
          type="button"
          className="vc-video-drop"
          disabled={!client || busy}
          onClick={() => {
            videoRef.current?.click();
          }}
        >
          <span className="vc-video-icon">VIDEO</span>
          <strong>
            {videoName ? videoName : '点击选择视频文件'}
          </strong>
          <span className="muted">MP4 · MOV · AVI · MKV · FLV</span>
          {uploadRatio > 0 && uploadRatio < 1 ? (
            <span className="vc-progress">
              上传中 {Math.round(uploadRatio * 100)}%
            </span>
          ) : null}
        </button>
        <input
          ref={videoRef}
          type="file"
          accept={VIDEO_ACCEPT}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) {
              void onPickVideo(f);
            }
          }}
        />
      </section>

      <section className="vc-step">
        <div className="vc-step-label">
          <span className="vc-num">3</span>
          描述
        </div>
        <textarea
          className="vc-textarea"
          placeholder="添加描述… 支持 #话题# 和 @用户"
          rows={4}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
        />
      </section>

      <section className="vc-step">
        <div className="vc-step-label">
          <span className="vc-num">4</span>
          封面图
        </div>
        <p className="muted vc-cover-tip">
          选填，未选择时自动使用视频首帧
        </p>
        <div className="vc-cover-row">
          <button
            type="button"
            className="vc-cover-box"
            disabled={!client || busy}
            onClick={() => {
              coverRef.current?.click();
            }}
          >
            {coverPreview ? (
              <img src={coverPreview} alt="封面" />
            ) : (
              <span>＋</span>
            )}
          </button>
          <div className="vc-cover-actions">
            <button
              type="button"
              className="btn secondary"
              disabled={!client || busy}
              onClick={() => {
                coverRef.current?.click();
              }}
            >
              从本地选择
            </button>
            <p className="muted">
              部分平台仅支持 1 张封面，多张时默认使用第一张
            </p>
            <p className="vc-ffmpeg-note">
              {ffmpegAvailable === false
                ? '自动提取需要先安装 ffmpeg，并将 ffmpeg 加入系统环境变量 PATH。'
                : status ||
                  '已检测到 ffmpeg 时，上传视频后会尝试自动抽取首帧。'}
            </p>
          </div>
        </div>
        <input
          ref={coverRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) {
              void onPickCover(f);
            }
          }}
        />
      </section>

      <footer className="vc-foot">
        <button
          type="button"
          className="btn secondary"
          disabled={busy}
          onClick={onCancel}
        >
          取消
        </button>
        <button
          type="button"
          className="btn"
          disabled={!client || busy}
          onClick={() => {
            void onSubmit();
          }}
        >
          {busy ? '处理中…' : '创建视频'}
        </button>
      </footer>
    </div>
  );
}

/**
 * File → data URL
 *
 * @param file 文件
 * @returns data URL
 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(String(reader.result ?? ''));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('读取文件失败'));
    };
    reader.readAsDataURL(file);
  });
}
