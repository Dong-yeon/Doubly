package com.fitto.voice.repository;

import com.fitto.voice.domain.VoiceClip;
import com.fitto.voice.domain.VoicePhrase;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface VoiceClipRepository extends JpaRepository<VoiceClip, Long> {

    List<VoiceClip> findByUserIdOrderByPhraseAsc(Long userId);

    Optional<VoiceClip> findByUserIdAndPhrase(Long userId, VoicePhrase phrase);

    void deleteByUserIdAndPhrase(Long userId, VoicePhrase phrase);
}
