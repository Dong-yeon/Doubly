package com.fitto.chat.repository;

import com.fitto.chat.domain.ChatPinnedMessage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ChatPinnedMessageRepository extends JpaRepository<ChatPinnedMessage, Long> {

    Optional<ChatPinnedMessage> findByRelationId(Long relationId);

    void deleteByRelationId(Long relationId);
}
