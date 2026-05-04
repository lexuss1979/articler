import Link from 'next/link';
import type { DashboardImage } from '../../../server/dashboard/data';

export function ImagesCard({ images }: { images: DashboardImage[] }) {
  return (
    <div className="border rounded p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium">Recent images</h2>
        {images.length > 0 && (
          <span className="text-xs text-gray-500">{images.length} latest</span>
        )}
      </div>
      {images.length === 0 ? (
        <p className="text-sm text-gray-500">
          No images yet. Generate or pick stock images in a session&apos;s
          illustration step.
        </p>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {images.map((img) => (
            <Link
              key={`${img.sessionId}/${img.slotId}`}
              href={`/sessions/${img.sessionId}`}
              className="block aspect-square overflow-hidden rounded border bg-gray-50 hover:opacity-80"
              title={img.model ? `Model: ${img.model}` : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/images/${img.localPath}`}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
