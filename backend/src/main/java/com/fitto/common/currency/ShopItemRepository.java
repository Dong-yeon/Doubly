package com.fitto.common.currency;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ShopItemRepository extends JpaRepository<ShopItem, String> {

    List<ShopItem> findAllByActiveTrueOrderByIdAsc();
}
