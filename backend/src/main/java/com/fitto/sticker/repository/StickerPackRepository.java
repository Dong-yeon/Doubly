package com.fitto.sticker.repository;

import com.fitto.sticker.domain.StickerPack;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StickerPackRepository extends JpaRepository<StickerPack, String> {
}
