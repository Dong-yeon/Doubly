package com.fitto.diet.dto;

import com.fitto.diet.domain.MealReminder;
import com.fitto.diet.domain.MealType;

import java.time.LocalTime;

/** 끼니 알림 조회 응답. */
public record MealReminderResponse(MealType mealType, LocalTime reminderTime) {
    public static MealReminderResponse from(MealReminder reminder) {
        return new MealReminderResponse(reminder.getMealType(), reminder.getReminderTime());
    }
}
