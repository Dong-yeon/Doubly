package com.fitto.call.dto;

import com.fitto.call.domain.CallType;
import jakarta.validation.constraints.NotNull;

public record StartCallRequest(@NotNull CallType callType) {
}
