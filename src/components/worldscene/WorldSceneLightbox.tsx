import { AnimatePresence, motion } from 'framer-motion';

interface Props {
  image: string | null;
  onClose: () => void;
}

export function WorldSceneLightbox({ image, onClose }: Props) {
  const safeImage = typeof image === 'string' && image.trim().length > 0 ? image : null;

  return (
    <AnimatePresence>
      {safeImage && (
        <motion.div
          className="worldscene-lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.img
            src={safeImage}
            alt="景点大图"
            referrerPolicy="no-referrer"
            decoding="async"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            onClick={(event) => event.stopPropagation()}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
